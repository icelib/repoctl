# repoctl 文档站部署

| 渠道   | 域名                               | Worker                             |
| ------ | ---------------------------------- | ---------------------------------- |
| 正式   | `https://repo.icebreaker.top`      | `repoctl-docs`                     |
| 预览   | `https://next.repo.icebreaker.top` | `repoctl-docs-next`                |
| 旧域名 | `https://repoctl.icebreaker.top`   | 跳转到正式域名，保留路径和查询参数 |

`repoctl-docs.yml` 在 main push 后自动部署预览。预览显示“未发布”提示，并通过页面 robots、`robots.txt` 和 `X-Robots-Tag` 禁止收录。正式文档由 Release 工作流在完整稳定发布收尾后传入发布完成记录部署，跟随 `main/latest`。独立修正与失败重试也使用同一个工作流，并共享 `docs-website-stable` 并发组。

## 初次迁移

迁移域名时保留当前正式 Worker 的已部署版本；不把任意 main 提交当作稳定发布记录。新正式域名绑定到原 Worker 后，再将旧域名的 Cloudflare 跳转方向改为 `repoctl` → `repo`，避免与原有 `repo` → `repoctl` 规则形成循环。

在首次完整稳定发布建立受管基线前，正式站继续提供原有内容。仓库中的 canonical、sitemap 与公开链接已切换到正式新域名；已部署旧内容的生成元数据会在首个合格稳定发布时更新。

已于 2026-10-23 关闭 `repoctl-docs` 的 Cloudflare Workers Builds 生产 Git 自动构建，旧预览分支构建亦处于关闭状态，防止 main 绕过发布门禁。正式 Worker 同时保留 `repo` 与 `repoctl` 的 custom domain；旧域名的 zone 跳转规则在 Worker 前生效，保留绑定以确保旧 DNS 持续可达。网站 package.json 不再提供直接生产/版本上传脚本。日常构建可用 `pnpm docs:build`，默认生成预览产物。两个根部署脚本只接受 `repo docs deploy` 注入的渠道、源码、部署身份和结果文件；稳定渠道另外要求受管 GitHub Actions 发布环境。

## 凭据与发布记录

GitHub Actions 继承 `icelib` 组织对所有仓库开放的部署 secrets，也支持仓库或 `docs-website-preview` / `docs-website-stable` environment 的 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`。Token 至少需要目标账户的 Workers Scripts 编辑，以及用于 custom domains 的 zone 权限；读取部署与版本记录也使用该 token。请把 token 保存在 secret，不放入仓库或命令参数。

发布完成记录和站点指针持久化在 `repoctl-release-state` 分支。网站配置覆盖本仓库的 13 个公开产品包及其运行依赖，比较各包发布来源的真实输入，包括包目录和真正参与构建的共享 TS 配置。整个仓库和锁文件仍从发布快照冻结安装；锁文件的全仓库变化不作为每个包都必须重新发布的证据。覆盖包实际引用的 default/named catalog 值仍逐项与发布来源比较；未引用的 catalog 变化不会迫使该包重发。模板包另外覆盖 `templates/**` 与受管根资产（包括随包分发的 `pnpm-workspace.yaml`），因为这些文件实际随 npm 发布；不能把模板中的 Markdown 或测试一概视为非发布输入。文档页面修正通过稳定基线上的补丁完成，不修改已经发布的 npm 模板。

部署适配器给 Cloudflare 版本写入 `repoctl-docs:<deploymentId>` message。部署前读取当前 100% 生效版本，若 message 与本次身份完全一致，直接恢复结果而不再次上传。上传后同时核验 Wrangler 的结构化版本输出和 Cloudflare 当前生效版本，确认后才写入 `REPO_DOCS_RESULT_FILE`。查询权限失败、流量分配异常或版本不匹配都会停止，不推进正式指针。

## 操作

使用 Documentation 工作流的手动入口，站点填 `website`：

- 预览选择 `preview`，可指定最新 main 的完整 SHA。
- 正式发布或重试选择 `stable`，填写发布完成记录 ID。
- 已发布文档修正选择 `stable`，填写已经进入 main 的纯文档提交 SHA；省略 release 则基于当前正式站。

修正路径仅允许网站 Markdown 和图片；源码、锁文件、部署配置和脚本无法作为文档补丁进入正式站。具体发布门禁与冲突处理参见网站的“让文档随稳定版本发布”页面。

验证适配器运行 `pnpm docs:test`；这也包含在根 `pnpm test` 中。根 `pnpm lint` 会检查部署脚本和站点配置。生成消费者会移除 repoctl 自己的站点配置及这些脚本，不会继承 repoctl 域名或生产发布任务。
