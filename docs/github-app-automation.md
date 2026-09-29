# 自动提交与 PR 检查

仓库保留合并前自动生成 `.changeset/auto-pr-<number>.md` 的流程。GitHub 会让内置 `GITHUB_TOKEN` 创建或更新的 PR 检查等待人工批准；使用 GitHub App installation token 后，检查可以自动运行。

## 一次性配置

1. 在组织中创建专用 GitHub App，关闭 webhook，只授予仓库 **Contents: Read and write**、**Pull requests: Read and write**；Metadata 的只读权限由 GitHub 自动提供。不需要 Actions 写权限或组织权限。
2. 将 App 安装到指定仓库，选择 **Only select repositories**。本仓库仅选择 `icelib/repoctl`。
3. 将 App 的 Client ID 保存为仓库 Actions variable `REPOCTL_APP_CLIENT_ID`。
4. 在 App 的 **Private keys → Generate a private key** 下载 `.pem` 文件，将包含 `BEGIN` / `END` 行的完整文件内容保存为 Actions secret `REPOCTL_APP_PRIVATE_KEY`。不要使用 Client secret、文件路径或额外 Base64 编码；否则会出现 `Invalid keyData` 等私钥解析错误。不要把私钥写入 Git、日志或 PR。
5. 查询 App 的机器人身份：`gh api 'users/<app-slug>[bot]' --jq .id`。把 `<id>+<app-slug>[bot]@users.noreply.github.com` 加入 `renovate.json` 的 `gitIgnoredAuthors`，保留原有 `github-actions[bot]` 邮箱。

工作流使用固定 SHA 的 `actions/create-github-app-token`，申请仅限当前仓库、仅有上述两项写权限的短期令牌，并在任务结束时撤销令牌。令牌有效期为一小时；Release 工作流如需运行超过一小时，应拆分发布阶段并重新申请令牌。

变量和 Secret 也可以配置在组织级别，只需确保其仓库访问策略包含当前仓库。Client ID 与数字 App ID 不同，`REPOCTL_APP_CLIENT_ID` 应使用 App 设置中的 Client ID。

## 工作流边界

- Automatic Release Intent 从 PR 基础提交读取受信任脚本，不执行 PR 分支代码。同仓库 PR 和手动 backfill 使用 App；fork 仍只通过内置令牌提醒贡献者补充 changeset，不申请 App 令牌、不写入 fork。
- 人工 changeset 和人工编辑过的自动 changeset 不会被覆盖。App 提交触发下一轮事件时，已匹配的 changeset 不会再次提交。
- Release 使用同一 App 令牌进行 Git checkout/push 和 GitHub API 操作，因此自动创建和更新 Release PR 都能触发检查。原有发布条件、必需检查、自动合并规则和 npm OIDC 发布方式不变。
- 分发模板也支持这些配置。未配置 App 时，自动 changeset 保留内置令牌；Release 按 `REPOCTL_RELEASE_TOKEN` → `CHANGESETS_RELEASE_TOKEN` → 内置令牌选择认证。回退到内置令牌时，仍可能需要手动批准 PR 检查。
- 只配置 Client ID 或只配置私钥会报错。配置完整但 App 未安装、权限不足或私钥无效时，令牌步骤失败，不会静默改用内置令牌。

## 验收与维护

先完成工作流和本地验证，再配置并安装 App，最后合入工作流。在同仓库 PR 中修改可发布包，确认自动 changeset 的最新提交上 CI 和 Release Intent Check 自动启动；用后续 Renovate 更新确认机器人仍能维护该分支。检查 Release PR 的创建、更新也能自动启动 CI。

`pull_request_target` 使用基础分支上的工作流，配置不会追溯启动已有等待批准的运行。变更合入后，用新 PR 或新提交验收，不用旧运行的手动重跑冒充自动触发证据。

轮换私钥时，先生成新私钥并更新 Secret，验证令牌获取正常后再删除旧私钥。恢复旧认证可移除两个 App 配置项；这样也会恢复内置令牌的批准限制。

参考：[GitHub 工作流触发与 GITHUB_TOKEN 限制](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)。
