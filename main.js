import { appendFileSync } from "fs";
import { getAvailableDomains } from "./domains.js";
import { loginAndGetCookie } from "./login.js";

// 签到
async function checkIn(cookie, domain) {
  const checkInUrl = `https://${domain}/user/checkin`;
  const response = await fetch(checkInUrl, {
    method: "POST",
    headers: {
      Cookie: cookie,
    },
  });

  if (!response.ok) {
    throw new Error(`网络请求出错 - ${response.status}`);
  }

  const text = await response.text();

  // 返回 HTML 说明 Cookie 无效，被重定向到登录页
  if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
    throw new Error("Cookie 无效或已过期，被重定向到登录页");
  }

  try {
    const data = JSON.parse(text);
    return data.msg;
  } catch {
    throw new Error(`签到接口返回异常: ${text.slice(0, 80)}`);
  }
}

// 获取账户 Cookie：优先用账号密码自动登录（Cookie 会过期），失败时回退到配置的 Cookie
async function resolveCookie(account, domain) {
  if (account.email && account.password) {
    try {
      console.log(`${account.name}: 使用账号密码自动登录获取 Cookie...`);
      const cookie = await loginAndGetCookie(account.email, account.password, domain);
      console.log(`${account.name}: ✅ 自动登录成功，已获取 Cookie`);
      return cookie;
    } catch (error) {
      console.warn(`${account.name}: 自动登录失败，回退到配置的 Cookie: ${error.message}`);
      if (account.cookie) {
        return account.cookie;
      }
      throw error;
    }
  }
  if (account.cookie) {
    return account.cookie;
  }
  throw new Error("账户缺少 cookie 或 email/password 配置");
}

// 处理单个账户：依次尝试所有可用域名，直到签到成功
async function processSingleAccount(account) {
  const domains = await getAvailableDomains();

  let lastError;

  for (const domain of domains) {
    try {
      const cookie = await resolveCookie(account, domain);
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
    const message = `❌ ${error.message.includes("JSON") ? "账户信息配置格式错误。" : error.message
      }`;
    console.error(message);
    setGitHubOutput("result", message);
    process.exit(1);
  }

  const allPromises = accounts.map((account) => processSingleAccount(account));
  const results = await Promise.allSettled(allPromises);

  const msgHeader = "\n======== 签到结果 ========\n\n";
  console.log(msgHeader);

  let hasError = false;

  const resultLines = results.map((result, index) => {
    const accountName = accounts[index].name;

    const isSuccess = result.status === "fulfilled";

    if (!isSuccess) {
      hasError = true;
    }

    const icon = isSuccess ? "✅" : "❌";
    const message = isSuccess ? result.value : result.reason.message;

    const line = `${accountName}: ${icon} ${message}`;

    isSuccess ? console.log(line) : console.error(line);

    return line;
  });

  const resultMsg = resultLines.join("\n");

  setGitHubOutput("result", resultMsg);

  if (hasError) {
    process.exit(1);
  }

  // 显式退出进程：Playwright 的浏览器进程可能让事件循环保持活跃，导致进程不退出
  process.exit(0);
}

main();
