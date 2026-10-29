import { appendFileSync } from "fs";
import { getAvailableDomains } from "./domains.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// 签到
async function checkIn(cookie, domain) {
  const response = await fetch(`https://${domain}/user/checkin`, {
    method: "POST",
    redirect: "manual",
    headers: {
      Cookie: cookie,
      "User-Agent": USER_AGENT,
      "X-Requested-With": "XMLHttpRequest",
      Referer: `https://${domain}/user`,
    },
    signal: AbortSignal.timeout(20000),
  });

  // 未登录/会话失效时面板会 302 到登录页
  if (response.status >= 300 && response.status < 400) {
    throw new Error("Cookie 无效或已过期（被重定向到登录页）");
  }

  if (!response.ok) {
    throw new Error(`网络请求出错 - ${response.status}`);
  }

  const text = await response.text();

  // 返回 HTML 说明 Cookie 无效，被重定向到登录页
  if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
    throw new Error("Cookie 无效或已过期，返回了登录页 HTML");
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`签到接口返回异常: ${text.slice(0, 80)}`);
  }

  // SSPanel 约定：ret > 0 表示成功
  if (data.ret === 0 || data.ret === false) {
    throw new Error(data.msg || "签到失败");
  }
  return data.msg || JSON.stringify(data);
}

// 取账户 Cookie
// 说明：iKuuu 登录已改为 GeeTest v4「点选图片」验证码 + AJAX 分阶段登录，
// 无法在 CI 里自动通过，因此不再支持账号密码自动登录，只支持 Cookie。
function resolveCookie(account) {
  if (account.cookie) return account.cookie;

  if (account.email || account.password) {
    throw new Error(
      "账号密码登录已不可用（iKuuu 改为图片点选验证码，脚本无法自动通过）。请在 ACCOUNTS 中为该账户配置 cookie"
    );
  }
  throw new Error("账户缺少 cookie 配置");
}

// 单个账户：依次尝试所有可用域名，直到签到成功
async function processSingleAccount(account) {
  const domains = await getAvailableDomains();
  const cookie = resolveCookie(account);

  let lastError;
  for (const domain of domains) {
    try {
      const msg = await checkIn(cookie, domain);
      console.log(`${account.name}（${domain}）: ${msg}`);
      return `${msg}（${domain}）`;
    } catch (error) {
      lastError = error;
      console.warn(`${account.name} 在 ${domain} 签到失败: ${error.message}`);
    }
  }

  throw lastError || new Error("所有域名签到失败");
}

function setGitHubOutput(name, value) {
  // 仅在 GitHub Actions 环境中写入（本地运行时 GITHUB_OUTPUT 未设置，跳过）
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<EOF\n${value}\nEOF\n`);
}

// 入口
async function main() {
  let accounts;

  try {
    if (!process.env.ACCOUNTS) {
      throw new Error("❌ 未配置账户信息。");
    }
    accounts = JSON.parse(process.env.ACCOUNTS);
  } catch (error) {
    const message = `❌ ${
      error.message.includes("JSON") ? "账户信息配置格式错误。" : error.message
    }`;
    console.error(message);
    setGitHubOutput("result", message);
    process.exit(1);
  }

  const results = await Promise.allSettled(
    accounts.map((account) => processSingleAccount(account))
  );

  console.log("\n======== 签到结果 ========\n");

  let hasError = false;
  const resultLines = results.map((result, index) => {
    const accountName = accounts[index].name;
    const isSuccess = result.status === "fulfilled";
    if (!isSuccess) hasError = true;

    const icon = isSuccess ? "✅" : "❌";
    const message = isSuccess ? result.value : result.reason.message;
    const line = `${accountName}: ${icon} ${message}`;

    isSuccess ? console.log(line) : console.error(line);
    return line;
  });

  setGitHubOutput("result", resultLines.join("\n"));

  if (hasError) process.exit(1);
  process.exit(0);
}

main();
