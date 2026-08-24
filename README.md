## iKuuu 定时自动签到

> 利用 Github Actions 实现自动签到，支持多账户，支持 Telegram 通知。

[![IKUUU-Auto-Checkin](https://github.com/ewigl/ikuuu-auto-checkin/actions/workflows/Checkin.yml/badge.svg)](https://github.com/ewigl/ikuuu-auto-checkin/actions/workflows/Checkin.yml)

### 仓库变量

- **ACCOUNTS**：账户信息，账户配置示例如下。推荐使用 [JSON 格式化工具](https://jsoneditoronline.org/) 进行编辑以避免格式出错。

  ```json
  [
    {
      "name": "这里填写账户备注",
      "cookie": "这里填写 Cookie"
    },
    {
      "name": "这里填写账户备注",
      "cookie": "只有一个账号可以删除这一条{}记录，有两个以上账号自行在下方添加新的{}记录。"
    }
  ]
  ```

- **HOST**: （可选）备用域名。脚本会自动从 `https://ikuuu.de/auth/login` 获取当前可用域名进行签到，无需手动配置。仅当自动获取失败时才使用此值，不设置时回退到 `ikuuu.foo`、`ikuuu.bar`。
- **TELEGRAM_TOKEN**: （可选）Telegram 通知的 Bot Token。
- **TELEGRAM_TO**: （可选）Telegram 通知的 Chat ID。

### 使用方法

0. 获取 Cookie：登录 iKuuu 后打开开发者工具，在控制台中输入 `document.cookie`，回车后复制输出的内容（不包含引号）作为 Cookie。

1. Fork 此仓库。
2. 在 fork 后的仓库中启用 Actions。
3. 配置仓库变量。

详细文档: https://ewigl.github.io/projects/github-actions-tasks/

### 注意事项

根据 [Github 的政策](https://docs.github.com/zh/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/disabling-and-enabling-a-workflow?tool=webui)，当 60 天内未发生仓库活动时，将自动禁用定时 Workflow。需要再次手动启用。
