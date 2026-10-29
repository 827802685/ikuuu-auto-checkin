## iKuuu 定时自动签到

> 利用 Github Actions 实现自动签到，支持多账户，支持 Telegram 通知。

[![IKUUU-Auto-Checkin](https://github.com/ewigl/ikuuu-auto-checkin/actions/workflows/Checkin.yml/badge.svg)](https://github.com/ewigl/ikuuu-auto-checkin/actions/workflows/Checkin.yml)

### 2026-10-29 更新说明（重要）

iKuuu 在 2026-09-11 做了一次站点改版，本站脚本因此全面失效，本次修复内容：

| 变化 | 影响 | 本次处理 |
| --- | --- | --- |
| 域名轮换：旧域名（`ikuuu.de` / `.win` / `.fyi` / `.one`）只剩「最新域名」公告页，面板迁到 `ikuuu.top` / `ikuuu.pw` | 旧代码从登录页脚本里提取域名的逻辑拿不到任何域名，回退到已失效的 `ikuuu.foo` / `ikuuu.bar`，全账户签到失败 | 改为渲染公告页取域名 + 静态候选兜底 + 逐个探测登录页可用性 |
| 登录页整页 base64 包裹（`var originBody = "..."`），验证码换成 GeeTest v4「图片点选」 | 无法自动通过验证码 | **移除账号密码自动登录**（含 Playwright 依赖），签到只走 Cookie |
| 登录改为 AJAX 分阶段（`phase=password/totp/email_code/reverse_email_verify`） | 旧逻辑等待页面跳转，永远超时 | 一并移除 |

结论：**Cookie 是唯一可用的自动签到方式**。Cookie 失效后需手动更新一次（建议勾选「记住我」再取 Cookie，有效期更长）。

### 仓库变量

- **ACCOUNTS**：账户信息，账户配置示例如下。推荐使用 [JSON 格式化工具](https://jsoneditoronline.org/) 进行编辑以避免格式出错。

  ```json
  [
    {
      "name": "账户备注",
      "cookie": "这里填写 Cookie"
    },
    {
      "name": "第二个账户",
      "cookie": "这里填写 Cookie"
    }
  ]
  ```

  > 只支持 `cookie` 字段。`email` / `password` 已不再支持（登录需要人工点选验证码）。

- **HOST**：（可选）强制指定域名，如 `ikuuu.top`。不配置时脚本会自动发现当前可用域名。
- **TELEGRAM_TOKEN**：（可选）Telegram 通知的 Bot Token。
- **TELEGRAM_TO**：（可选）Telegram 通知的 Chat ID。

### 使用方法

1. 登录 iKuuu（当前可用域名：`ikuuu.top` / `ikuuu.pw`），勾选「记住我」登录。
2. 打开开发者工具 → Console，输入 `document.cookie`，回车后复制输出内容（不含引号）作为 Cookie。
3. Fork 此仓库，在 fork 中启用 Actions。
4. 配置仓库变量 `ACCOUNTS`。

### 域名发现逻辑

1. 依次请求 `ikuuu.de` / `ikuuu.one` / `ikuuu.win` / `ikuuu.fyi` 的「最新域名」公告页，用 jsdom 执行页面脚本后从 DOM 中读出域名；
2. 与内置历史域名列表合并；
3. 逐个请求 `https://<域名>/auth/login`，只有返回真正的登录页（含 `#email` 表单）才判定可用；
4. 按可用顺序逐个尝试签到。

### 常见失败原因

| 现象 | 原因 |
| --- | --- |
| `Cookie 无效或已过期（被重定向到登录页）` | Cookie 过期或换了设备/浏览器，重新取一次 |
| `未探测到可用登录页` | 全站维护或再次换域名，等公告页更新域名后重跑即可 |
| 60 天无仓库活动后工作流被停用 | GitHub 策略，手动重新启用 |

### 注意事项

根据 [Github 的政策](https://docs.github.com/zh/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/disabling-and-enabling-a-workflow?tool=webui)，当 60 天内未发生仓库活动时，将自动禁用定时 Workflow。需要再次手动启用。
