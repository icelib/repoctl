# 把校验加入 CI

## 适用场景

当本地命令已经稳定，需要在每个 pull request 或分支上执行同一套仓库策略时，使用这个任务。

## 前置条件

- 已经生成通过检查的 `repo check --dry-run` 计划。
- CI runner 具备 Node.js、pnpm 和仓库锁文件。
- 发布或发版 job 使用非交互凭据。

## 最小命令

```bash
repo check --full --json --out reports/check-plan.json
```

## 预期输出

CI 会得到稳定的计划，并可以把 JSON 或 Markdown 报告作为 artifact 上传。同一条命令也可以在本地执行。

## 常见分支

- pull request 需要快速门禁：使用 `repo check --staged` 或仓库的 pre-commit 模式。
- main 分支需要完整门禁：使用 `repo check --full`。
- 发布 job 需要版本计划：发布前执行 `repo release plan --json`。

repoctl 的命令可以分成两类：给人用的日常入口，以及给 CI、脚本、编辑器用的可保存输出。

## 本地日常工作流

```bash
pnpm install
pnpm run repo:doctor
pnpm run repo:new -- sdk --template tsdown
pnpm run repo:check
pnpm build
```

这条链路适合新成员第一次进入仓库：

| 步骤                   | 判断标准                                         |
| ---------------------- | ------------------------------------------------ |
| `pnpm install`         | workspace 依赖和本地链接完整                     |
| `pnpm run repo:doctor` | 仓库根目录、Node、脚本、配置和提交链路可用       |
| `pnpm run repo:new`    | 新包由模板创建，目录和 package metadata 符合约定 |
| `pnpm run repo:check`  | 提交前轻量校验可以复现                           |
| `pnpm build`           | 全仓构建链路没有明显断点                         |

## 存量仓库接入

```bash
pnpm add -D repoctl
pnpm exec repo init --yes
pnpm exec repo doctor --markdown --out reports/doctor.md
pnpm exec repo upgrade --no-overwrite
pnpm exec repo doctor
```

推荐先用 `--no-overwrite` 保守接入。确认标准资产差异后，再决定是否使用 `--yes` 或 `--overwrite`。

## CI 快速门禁

```bash
pnpm install --frozen-lockfile
pnpm exec repo doctor --strict
pnpm exec repo check --full
```

适合小仓库或早期项目。`doctor --strict` 会把 warning 也当成失败，能避免配置漂移慢慢积累。

## CI 报告模式

```bash
pnpm exec repo doctor --json --out reports/doctor.json
pnpm exec repo check --json --out reports/check-plan.json
pnpm exec repo env support --markdown --redact --out reports/support.md
```

这组命令适合想保存构建上下文的 CI：

- `doctor.json` 给脚本判断仓库健康状态。
- `check-plan.json` 记录本次会跑哪些校验。
- `support.md` 适合上传为 artifact，或贴进 issue / PR。

## pre-commit 与 pre-push

repoctl 暴露了底层 verify 命令，方便 hook 和脚本复用：

```bash
repo verify pre-commit
repo verify staged-typecheck packages/app/src/main.ts
repo verify commit-msg .git/COMMIT_EDITMSG
repo verify pre-push
```

默认建议：

| 阶段       | 推荐行为                                                |
| ---------- | ------------------------------------------------------- |
| pre-commit | 聚焦 staged 文件，运行格式、lint 和 workspace typecheck |
| commit-msg | 校验 Conventional Commit 格式                           |
| pre-push   | 跑整仓 lint/typecheck，并按变更范围补 build/test/tsd    |

## 自动化创建预览

```bash
repo new dashboard --template vue-hono --json --out plans/dashboard.json
repo templates --markdown --out docs/templates.md
repo ws ls --json --out reports/workspaces.json
```

这些命令都不会要求人工选择，适合编辑器插件、脚本和 CI bot。

## 推荐流水线拆分

| 阶段 | 命令                                                            | 失败后先看                            |
| ---- | --------------------------------------------------------------- | ------------------------------------- |
| 安装 | `pnpm install --frozen-lockfile`                                | lockfile、Node、pnpm 版本             |
| 诊断 | `repo doctor --strict`                                          | [doctor 诊断](/zh/start/diagnose)     |
| 计划 | `repo check --full --json --out reports/check-plan.json`        | [报告与自动化输出](/zh/tasks/reports) |
| 执行 | `repo check --full`                                             | 失败的 root script 或 workspace 任务  |
| 留证 | `repo env support --markdown --redact --out reports/support.md` | CI artifact                           |

早期项目可以把计划和执行合并。成熟项目建议保留 `reports/`，方便失败时复盘实际执行路径。

## 非交互参数选择

| 场景               | 推荐参数                                           |
| ------------------ | -------------------------------------------------- |
| 初始化时接受默认值 | `repo init --yes`                                  |
| 同步时保留已有改动 | `repo upgrade --no-overwrite`                      |
| 明确覆盖标准资产   | `repo upgrade --yes` 或 `repo upgrade --overwrite` |
| 只看计划不执行     | `--dry-run`                                        |
| 输出给脚本         | `--json --out <file>`                              |
| 输出给人看并脱敏   | `--markdown --redact --out <file>`                 |

## 文档 Worker

repoctl 文档通过名为 `repoctl-docs` 的 Cloudflare Worker 部署。VitePress 只生成静态资产，Workers Static Assets 直接提供这些文件，因此不需要应用 handler，也不声明 `ASSETS` binding。

### Workers Builds 配置

| 配置项     | 值                                                      |
| ---------- | ------------------------------------------------------- |
| 仓库根目录 | 仓库根目录                                              |
| 生产分支   | `main`                                                  |
| 构建命令   | `pnpm --filter @icebreakers/website build`              |
| 生产部署   | `pnpm --filter @icebreakers/website run deploy`         |
| 非生产部署 | `pnpm --filter @icebreakers/website run deploy:preview` |

构建命令会先校验双语页面，再由 VitePress 生成 `.vitepress/dist`。Worker 配置会为不存在的路由返回生成后的 `404.html`，并继续读取 `public/_redirects`，兼容旧的 `/en/*` 链接。

### 预览、发布与回滚

修改生产部署前，先完成本地验证：

```bash
pnpm --filter @icebreakers/website build
pnpm --filter @icebreakers/website run deploy:dry-run
pnpm --filter @icebreakers/website exec wrangler dev
```

非生产 Workers Builds 上传预览版本。验证通过后再执行生产部署。需要回滚时，先查看版本历史，再选择最近的稳定版本：

```bash
pnpm --filter @icebreakers/website exec wrangler versions list
pnpm --filter @icebreakers/website exec wrangler rollback <VERSION_ID>
```

`repoctl.icebreaker.top` 是唯一 canonical custom domain。Cloudflare Redirect Rules 把 `repo.icebreaker.top/*` 和 `monorepo.icebreaker.top/*` 永久跳转到主域名，同时保留路径和查询参数。

## 下一步

- 查所有参数：[命令速查](/zh/reference/commands)
- 理解本地校验：[运行校验](/zh/tasks/checks)
- 生成排障包：[报告与自动化输出](/zh/tasks/reports)
- 看短命令：[命令别名](/zh/reference/aliases)
