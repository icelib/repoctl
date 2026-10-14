# 自动提交认证

本源码仓库的 PR 检查统一等待 `pr-ci` 环境审批。批准后使用内置 `GITHUB_TOKEN` 自动生成 `.changeset/auto-pr-<number>.md`，再验证最终提交；这类自动提交不会重新触发 PR 检查。人和 AI 的审批方式见 [PR 检查审批](./pr-ci-approval.md)。

GitHub App 用于 Release 自动提交与 Release PR，以及手动 backfill 发布意图。App 创建或更新的 PR 可以触发工作流，但本仓的 PR 验证仍先等待环境审批。分发模板保留自动 PR 检查和自动 changeset，使用 App 后可以继续触发这些检查。

## 一次性配置

1. 在组织中创建专用 GitHub App，关闭 webhook，只授予仓库 **Contents: Read and write**、**Pull requests: Read and write**；Metadata 的只读权限由 GitHub 自动提供。不需要 Actions 写权限或组织权限。
2. 将 App 安装到指定仓库，选择 **Only select repositories**。本仓库仅选择 `icelib/repoctl`。
3. 将 App 的 Client ID 保存为仓库 Actions variable `REPOCTL_APP_CLIENT_ID`。
4. 在 App 的 **Private keys → Generate a private key** 下载 `.pem` 文件，将包含 `BEGIN` / `END` 行的完整文件内容保存为 Actions secret `REPOCTL_APP_PRIVATE_KEY`。不要使用 Client secret、文件路径或额外 Base64 编码；否则会出现 `Invalid keyData` 等私钥解析错误。不要把私钥写入 Git、日志或 PR。
5. 查询 App 的机器人身份：`gh api 'users/<app-slug>[bot]' --jq .id`。把 `<id>+<app-slug>[bot]@users.noreply.github.com` 加入 `renovate.json` 的 `gitIgnoredAuthors`，保留原有 `github-actions[bot]` 邮箱。

工作流使用固定 SHA 的 `actions/create-github-app-token`，申请仅限当前仓库、仅有上述两项写权限的短期令牌，并在任务结束时撤销令牌。令牌有效期为一小时；Release 工作流如需运行超过一小时，应拆分发布阶段并重新申请令牌。

变量和 Secret 也可以配置在组织级别，只需确保其仓库访问策略包含当前仓库。Client ID 与数字 App ID 不同，`REPOCTL_APP_CLIENT_ID` 应使用 App 设置中的 Client ID。

## 工作流边界

- 本源码仓库的 PR Checks 从受信任的基础分支代码准备 changeset，不申请 App 令牌，也不执行 PR 分支代码。fork 只通过内置令牌提醒贡献者补充 changeset，不写入 fork。
- 本仓 Automatic Release Intent 仅接受 `workflow_dispatch` 手动 backfill，不再自动响应 PR 事件；它保留 App 认证。
- 分发模板的 Automatic Release Intent 继续自动响应 `pull_request_target`。同仓 PR 和手动 backfill 使用 App；fork 不申请 App 令牌。人工 changeset 和人工编辑过的自动 changeset 不会被覆盖，已匹配的 changeset 不会再次提交。
- Release 使用同一 App 令牌进行 Git checkout/push 和 GitHub API 操作，因此自动创建和更新 Release PR 都能触发工作流。本仓 Release PR 等待 `pr-ci` 审批，原有发布条件和 npm OIDC 发布方式保留。
- 本仓 Release 若使用内置令牌创建或更新 Release PR，会显式启动默认分支上的 PR Checks，补上被内置令牌抑制的 PR 事件。它仍等待 `pr-ci` 审批；这个 dispatch 步骤和 Actions 写权限不进入分发模板。
- 未配置 App 的分发模板，自动 changeset 使用内置令牌；Release 按 `REPOCTL_RELEASE_TOKEN` → `CHANGESETS_RELEASE_TOKEN` → 内置令牌选择认证。内置令牌的提交不会触发新的工作流，相关 PR 可能需要手动启动检查。
- 只配置 Client ID 或只配置私钥会报错。配置完整但 App 未安装、权限不足或私钥无效时，令牌步骤失败，不会静默改用内置令牌。

## 验收与维护

先完成工作流和本地验证，再配置并安装 App 以及 `pr-ci` 审批环境，最后合入工作流。本仓的新 PR 应先等待审批；批准后在自动 changeset 的最终提交上获得 PR Validation。Release PR 的创建和更新也应等待审批。用后续 Renovate 更新确认机器人仍能维护该分支。分发模板则应保持自动 changeset 和自动 PR CI。

`pull_request_target` 使用基础分支上的工作流，配置不会追溯启动已有等待批准的运行。变更合入后，用新 PR 或新提交验收，不用旧运行的手动重跑冒充自动触发证据。

轮换私钥时，先生成新私钥并更新 Secret，验证令牌获取正常后再删除旧私钥。恢复内置令牌认证时同时移除两个 App 配置项；本仓的 `pr-ci` 环境审批不受 App 认证选择影响。

参考：[GitHub 工作流触发与 GITHUB_TOKEN 限制](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)。
