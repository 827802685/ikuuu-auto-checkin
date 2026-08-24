import vm from "vm";

const SOURCE_URL = "https://ikuuu.de/auth/login";
const FALLBACK_HOSTS = ["ikuuu.foo", "ikuuu.bar"];
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// 缓存域名获取 Promise，避免多账户并发时重复请求
let cachedDomainsPromise = null;

// 构造浏览器环境 mock，用于在 VM 中执行登录页脚本
function createSandbox() {
  const makeElement = (id) => ({
    id,
    innerHTML: "",
    textContent: "",
    style: {},
    children: [],
    childNodes: [],
    appendChild() {},
    setAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    getAttribute() {
      return null;
    },
  });

  const elements = {};
  const document = {
    getElementById(id) {
      if (!elements[id]) elements[id] = makeElement(id);
      return elements[id];
    },
    createElement(tag) {
      return makeElement(tag);
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    documentElement: makeElement("html"),
    body: makeElement("body"),
    head: makeElement("head"),
    cookie: "",
    readyState: "complete",
    addEventListener() {},
    removeEventListener() {},
  };

  const sandbox = {
    console,
    document,
    navigator: { userAgent: USER_AGENT, language: "zh-CN" },
    location: { href: SOURCE_URL, host: "ikuuu.de", protocol: "https:" },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    AbortController,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    XMLHttpRequest: function () {
      return {
        open() {},
        send() {},
        setRequestHeader() {},
        readyState: 4,
        status: 200,
        responseText: "",
      };
    },
    URL,
    URLSearchParams,
    Blob,
    FormData: function () {},
    Headers,
    Request,
    Response,
    atob,
    btoa,
    decodeURIComponent,
    encodeURIComponent,
    RegExp,
    Math,
    Date,
    JSON,
    String,
    Number,
    Boolean,
    Array,
    Object,
    Promise,
    Symbol,
    Error,
    TypeError,
    RangeError,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
  };

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;
  sandbox.parent = sandbox;

  return sandbox;
}

// 在 VM 中执行登录页脚本并提取域名数组
function extractDomainsFromScript(script) {
  const context = vm.createContext(createSandbox());

  try {
    vm.runInContext(script, context, { filename: "ikuuu.js", timeout: 10000 });
  } catch (error) {
    // 脚本中的反调试/渲染代码可能抛错，但域名数组在顶层已定义，不影响提取
  }

  try {
    const list = vm.runInContext("_0x2ea253", context);
    if (Array.isArray(list)) {
      return list
        .map((item) => {
          if (!item || typeof item.url !== "string") return null;
          try {
            return new URL(item.url).hostname;
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    }
  } catch (error) {
    // 忽略，走备用域名
  }

  return [];
}

// 从登录页获取可用域名，失败时回退到 HOST 环境变量和已知域名
async function fetchDomains() {
  // ikuuu.de 存在间歇性连接问题，重试 3 次
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(SOURCE_URL, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(
        (m) => m[1]
      );
      const script =
        scripts.find((s) => s.includes("ikuuu")) ||
        scripts[scripts.length - 1];

      if (!script) throw new Error("页面中未找到脚本");

      const domains = extractDomainsFromScript(script);
      if (!domains.length) throw new Error("未提取到域名");

      console.log(`✅ 已从 ${SOURCE_URL} 获取可用域名: ${domains.join(", ")}`);
      return domains;
    } catch (error) {
      if (attempt < 3) {
        console.warn(
          `⚠️ 获取域名第 ${attempt} 次失败（${error.message}），正在重试...`
        );
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      } else {
        const fallback = [
          ...new Set([process.env.HOST, ...FALLBACK_HOSTS].filter(Boolean)),
        ];
        console.warn(
          `⚠️ 获取域名失败（${error.message}），使用备用域名: ${fallback.join(", ")}`
        );
        return fallback;
      }
    }
  }
}

// 获取可用域名（带缓存）
export function getAvailableDomains() {
  if (!cachedDomainsPromise) {
    cachedDomainsPromise = fetchDomains();
  }
  return cachedDomainsPromise;
}
