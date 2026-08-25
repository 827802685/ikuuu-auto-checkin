import { chromium } from "playwright";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// 反检测初始化脚本：隐藏自动化特征，让 GeeTest 无感验证通过
const STEALTH_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
  Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  const originalQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (parameters) =>
    parameters.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission })
      : originalQuery(parameters);
`;

// 启动浏览器：优先使用系统 Chrome（GitHub Actions 预装），回退到 Playwright 自带 Chromium
async function launchBrowser() {
  const launchOptions = {
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-infobars",
    ],
  };

  // 尝试系统 Chrome
  try {
    return await chromium.launch({ ...launchOptions, channel: "chrome" });
  } catch {
    // 回退到 Playwright 自带 Chromium
    return await chromium.launch(launchOptions);
  }
}

// 用账号密码登录 iKuuu，返回 Cookie 字符串
export async function loginAndGetCookie(email, password, domain) {
  let browser;
  try {
    browser = await launchBrowser();

    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 800 },
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
      colorScheme: "light",
    });
    await context.addInitScript(STEALTH_SCRIPT);

    const page = await context.newPage();

    // 1. 访问登录页
    await page.goto(`https://${domain}/auth/login`, {
      waitUntil: "networkidle",
      timeout: 45000,
    });

    // 2. 等待 GeeTest 无感验证加载
    await page.waitForFunction(
      () => window.Captcha && window.Captcha.isLoaded && window.Captcha.isLoaded(),
      { timeout: 25000 }
    );

    // 3. 填写账号密码
    await page.fill("#email", email);
    await page.fill("#password", password);

    // 4. 点击验证按钮（无感验证自动通过）
    const verifyBtn = await page.$(
      ".geetest_btn, .geetest_holder, .captcha-form-item"
    );
    if (verifyBtn) {
      const box = await verifyBtn.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      }
    }

    // 5. 等待验证完成
    let captchaReady = false;
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(2000);
      captchaReady = await page.evaluate(
        () => window.Captcha && window.Captcha.isReady && window.Captcha.isReady()
      );
      if (captchaReady) break;
    }
    if (!captchaReady) {
      throw new Error("验证码验证失败（GeeTest 未通过）");
    }

    // 6. 点击 Login 按钮提交
    const loginBtn = await page.$('button[type="submit"]');
    if (loginBtn) {
      const box = await loginBtn.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      }
    }

    // 7. 等待登录成功（页面跳转离开 /auth/login）
    let loggedIn = false;
    let errorMsg = null;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(1000);
      const url = page.url();
      if (!url.includes("/auth/login")) {
        loggedIn = true;
        break;
      }
      // 检查是否有错误提示
      errorMsg = await page.evaluate(() => {
        const el = document.querySelector(
          ".alert-danger, .alert, .error, .login-error, .swal2-title, .swal2-html-container"
        );
        return el ? el.textContent.trim() : null;
      });
      if (errorMsg) break;
    }

    if (!loggedIn) {
      throw new Error(errorMsg ? `登录失败: ${errorMsg}` : "登录超时，未能成功登录");
    }

    // 8. 提取 Cookie
    const cookies = await context.cookies();
    const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    if (!cookieStr) {
      throw new Error("登录成功但未获取到 Cookie");
    }

    return cookieStr;
  } finally {
    if (browser) await browser.close();
  }
}
