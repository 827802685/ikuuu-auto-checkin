import { appendFileSync } from "fs";
import { getAvailableDomains } from "./domains.js";

// 签到
async function checkIn(account, domain) {
  const checkInUrl = `https://${domain}/user/checkin`;
  const response = await fetch(checkInUrl, {
    method: "POST",
    headers: {
      Cookie: account.cookie,
    },
  });

  if (!response.ok) {
    throw new Error(`网络请求出错 - ${response.status}`);
  }

  const data = await response.json();

  return data.msg;
}

// 处理单个账户：依次尝试所有可用域名，直到签到成功
async function processSingleAccount(account) {
  const domains = await getAvailableDomains();

  let lastError;

  for (const domain of domains) {
    try {
      const msg = await checkIn(account, domain);
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
}

main();
