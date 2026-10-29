import { JSDOM } from "jsdom";

// iKuuu 官网会不定期轮换域名。旧的「从登录页脚本里提取域名数组」做法已失效：
// 现在旧域名只剩一个「最新域名」公告页（脚本被混淆、域名由脚本写入 DOM），
// 登录页整页还被 base64 包裹了一遍。
// 因此这里改为：渲染公告页取域名 -> 合并静态候选 -> 逐个探测登录页是否可用。

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// 公告页入口（任意一个能打开即可）
const NOTICE_URLS = [
  "https://ikuuu.de/",
  "https://ikuuu.one/",
  "https://ikuuu.win/",
  "https://ikuuu.fyi/",
];

// 历史出现过的域名，作为公告页不可用时的兜底
const STATIC_DOMAINS = [
  "ikuuu.top",
  "ikuuu.pw",
  "ikuuu.win",
  "ikuuu.fyi",
  "ikuuu.one",
  "ikuuu.de",
  "ikuuu.ltd",
  "ikuuu.org",
  "ikuuu.eu",
  "ikuuu.nl",
  "ikuuu.foo",
  "ikuuu.bar",
  "ikuuu.co.uk",
];

const DOMAIN_RE = /\bikuuu\.[a-z]{2,6}(?:\.[a-z]{2})?\b/gi;
const REQUEST_TIMEOUT = 12000;

let cachedDomainsPromise = null;

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    redirect: "follow",
    headers: { "User-Agent": USER_AGENT, ...(options.headers || {}) },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });
  const text = await response.text();
  return { response, text };
}

// 登录页整页被 base64 包裹：var originBody = "<base64>"; document.write(decodeBase64(...))
function unwrapBase64(html) {
  const match = html.match(/var\s+originBody\s*=\s*"([^"]+)"/);
  if (!match) return html;
  try {
    return Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return html;
  }
}

function pickDomains(text) {
  return (text.match(DOMAIN_RE) || []).map((d) => d.toLowerCase());
}

// 渲染公告页，读取「最新域名」列表（域名由混淆脚本写入 DOM，必须真实执行脚本）
async function domainsFromNotice(url) {
  const { text } = await request(url);
  const dom = new JSDOM(text, {
    url,
    runScripts: "dangerously",
    pretendToBeVisual: true,
  });

  // 公告页会用 fetch/HEAD 检测各域名在线状态，注入后脚本才能跑完
  dom.window.fetch = (input, init) => fetch(input, init);
  dom.window.Headers = Headers;
  dom.window.Request = Request;
  dom.window.Response = Response;

  await new Promise((resolve) => setTimeout(resolve, 3000));

  const { document } = dom.window;
  const found = new Set();
  for (const anchor of document.querySelectorAll("a[href]")) {
    pickDomains(anchor.getAttribute("href") || "").forEach((d) => found.add(d));
  }
  pickDomains(document.body?.textContent || "").forEach((d) => found.add(d));

  dom.window.close();
  return [...found];
}

// 判断某个域名当前是否是可用的登录页
async function isLoginPage(domain) {
  try {
    const { response, text } = await request(`https://${domain}/auth/login`);
    if (!response.ok) return false;
    // 被重定向到公告页/首页，说明这个域名已经不是面板了
    if (!/\/auth\/login$/.test(new URL(response.url).pathname)) return false;
    const html = unwrapBase64(text);
    return html.includes('id="email"') || html.includes("captcha-form-item");
  } catch {
    return false;
  }
}

async function discoverDomains() {
  const candidates = new Set();
  if (process.env.HOST) pickDomains(process.env.HOST).forEach((d) => candidates.add(d));

  const noticeResults = await Promise.allSettled(NOTICE_URLS.map(domainsFromNotice));
  const fromNotice = [];
  noticeResults.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value.length) {
      console.log(`✅ 公告页 ${NOTICE_URLS[index]} 给出域名: ${result.value.join(", ")}`);
      result.value.forEach((d) => fromNotice.push(d));
    }
  });

  // 公告页给出的域名优先，其次是静态候选
  for (const domain of STATIC_DOMAINS) candidates.add(domain);

  const ordered = [...new Set([...fromNotice, ...candidates])];
  const checks = await Promise.all(
    ordered.map(async (domain) => ({ domain, ok: await isLoginPage(domain) }))
  );

  const available = checks.filter((item) => item.ok).map((item) => item.domain);
  if (available.length) {
    console.log(`✅ 可用域名: ${available.join(", ")}`);
    return available;
  }
  console.warn("⚠️ 未探测到可用登录页，按候选顺序逐个尝试");
  return ordered;
}

export function getAvailableDomains() {
  if (!cachedDomainsPromise) {
    cachedDomainsPromise = discoverDomains().catch((error) => {
      console.warn(`⚠️ 域名发现异常: ${error.message}，回退到静态候选`);
      return [...new Set([process.env.HOST, ...STATIC_DOMAINS].filter(Boolean))];
    });
  }
  return cachedDomainsPromise;
}
