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

## 生成 affected GitHub Actions matrix

```bash
pnpm exec repo check --affected --base origin/main --matrix
pnpm exec repo check --affected --base origin/main --filter @scope/web --matrix
pnpm exec repo check --affected --base origin/main --matrix --shards 16 --out reports/matrix.json
```

`--matrix` 始终以 JSON 预览，不执行检查，不创建或修改 workflow；只有显式 `--out` 会写出报告。它要求 `--affected`，复用相同的 `--base`、`--head`、可重复的 `--filter` 和 `--global-input`，不能与 `--markdown` 或执行报告选项组合。matrix 本身已经是 JSON 预览，因此 `--json`、`--dry-run` 可省略。

公共 `resolveAffectedCheckMatrix(options)` API 返回 `schemaVersion: 1`、`provider: "github-actions"`、`hasWork`、`grouping`、`summary`、`matrix: { include: [...] }` 和完整 `affectedPlan`。内嵌计划与相同输入的 `resolveAffectedCheckPlan` 一致，保留选择原因、Git 诊断和跳过阶段。**仅将 `matrix` 传给 `fromJSON`**，并在 strategy 展开之前用 `hasWork` 控制 job；无变更或没有可执行阶段时返回 `hasWork: false`、`include: []`。

每个矩阵项包含稳定 `id`、相对 workspace 的 `packages`，以及按顺序排列的 `commands`；命令保留 `executable`/`args`、`targets`、`prerequisiteTargets` 和 `skipReason`。在新 checkout 的根目录执行参数数组，展示用的 `command` 字符串不应用于 shell 求值。每个 job 内始终完整运行 **build → lint → typecheck → tsd → test**，其 build 还包含内部依赖，消费者无需等待其他矩阵 job 的构建产物。缺失脚本仍有明确原因；没有可执行命令的组列在 `summary.skippedPackages`。

默认每个选中的 workspace 对应一个 job。`--shards N`（1–256）先按包目录排序，再循环分配到最多 N 组，不丢弃任何包。超过 GitHub 的 256-job 上限时会明确报错，并提示使用 `--shards 256` 或更少。序列化后的 matrix 还会按 UTF-16 估算检查 1 MB job-output 上限，并为元数据预留少量空间。超限时明确失败，不截断目标；减少分片可以避免重复的依赖构建数据。所有全量回退都保留为**一个完整 job**，即使设置了 `--shards`，以保留根脚本并保守处理不确定的依赖图。Git 基线缺失或引用无效时，沿用 affected 的全量回退，并保留明确的诊断码，不会变成成功的空矩阵。

以下示例拉取完整 Git 历史，使用 PR 的 base SHA。每个 job 检出同一事件提交并按相同 lockfile 安装依赖，只需 `contents: read` 权限。pnpm store 缓存不会替代 job 自身的依赖构建，任务排序和缓存仍由已有 pnpm/Turbo 脚本负责。示例面向 Linux，通过环境变量传递矩阵数据，再执行参数数组，因此含空格、引号或 shell 语法的路径仍只是数据。

```yaml
name: Affected checks
on: pull_request
permissions:
  contents: read
jobs:
  plan:
    runs-on: ubuntu-latest
    outputs:
      matrix: ${{ steps.matrix.outputs.matrix }}
      has-work: ${{ steps.matrix.outputs.has-work }}
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - id: matrix
        env:
          BASE_SHA: ${{ github.event.pull_request.base.sha }}
        run: |
          node --input-type=module <<'JS'
          import { appendFileSync } from 'node:fs'
          import { resolveAffectedCheckMatrix } from 'repoctl'
          const result = await resolveAffectedCheckMatrix({
            cwd: process.cwd(), base: process.env.BASE_SHA, head: 'HEAD', shards: 16,
          })
          appendFileSync(process.env.GITHUB_OUTPUT,
            `has-work=${result.hasWork}\nmatrix=${JSON.stringify(result.matrix)}\n`)
          if (result.affectedPlan.fallback.length) {
            console.error('Full fallback:', JSON.stringify(result.affectedPlan.fallback))
          }
          JS
  checks:
    needs: plan
    if: ${{ needs.plan.outputs.has-work == 'true' }}
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix: ${{ fromJSON(needs.plan.outputs.matrix) }}
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Run this job's planned stages
        env:
          MATRIX_JOB: ${{ toJSON(matrix) }}
        run: |
          node --input-type=module <<'JS'
          import { spawnSync } from 'node:child_process'
          const job = JSON.parse(process.env.MATRIX_JOB)
          for (const command of job.commands) {
            if (command.skipReason) continue
            const result = spawnSync(command.executable, command.args, {
              stdio: 'inherit', shell: false,
            })
            if (result.error) throw result.error
            if (result.status !== 0) process.exit(result.status ?? 1)
          }
          JS
```

计划步骤使用 API，避免在选择前生成未跟踪的报告。使用 `--out` 时，应写入已忽略的报告目录。生成 matrix 不会修改或触发远程 workflow。参见 [GitHub matrix 语法](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations) 和 [Turborepo 任务执行](https://turborepo.dev/docs/reference/run)。

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
