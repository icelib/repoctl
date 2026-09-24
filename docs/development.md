# 源仓库开发场景

使用 Node.js 22.13+ 和根 `package.json` 指定的 pnpm 版本。先执行 `pnpm install`；安装后的 `postinstall` 会构建工作区。

## 选择开发入口

| 命令                            | 范围                                                              | 启动顺序                                     |
| ------------------------------- | ----------------------------------------------------------------- | -------------------------------------------- |
| `pnpm dev` / `pnpm dev:repoctl` | repoctl 及其本地依赖                                              | 依赖图构建 → 同步模板资产 → 依赖图监听       |
| `pnpm dev:create`               | monorepo-templates、create-repoctl、create-icebreaker             | 依赖图构建 → 同步模板资产 → 依赖图监听       |
| `pnpm dev:configs`              | ESLint、Stylelint、Commitlint、相关插件、Lightning CSS、changelog | 依赖图构建与监听                             |
| `pnpm dev:packages`             | 全部 `packages/*`                                                 | 依赖图构建 → 同步模板资产 → 依赖图监听       |
| `pnpm dev:client`               | Vue 与同目录下的 Worker                                           | 构建共享工具 → 类型生成 → Vite               |
| `pnpm dev:server`               | 独立 Worker API                                                   | 构建共享工具 → 类型生成 → Wrangler           |
| `pnpm dev:server:node`          | 独立 API 的 Node 运行模式                                         | 构建共享工具 → Node watch                    |
| `pnpm dev:docs`                 | VitePress 文档                                                    | 构建共享工具 → VitePress                     |
| `pnpm dev:cli`                  | CLI 模板                                                          | 构建与监听；另开终端执行生成的 CLI           |
| `pnpm dev:tsdown`               | TypeScript 库模板                                                 | 构建与监听                                   |
| `pnpm dev:vue-lib`              | Vue 组件库模板                                                    | 构建 → Vitest watch；目前没有交互 playground |
| `pnpm dev:assets`               | 模板与受管资产副本                                                | 一次性构建同步工具并刷新副本                 |

默认命令不会启动 client、server 或文档服务。停止当前场景使用 Ctrl+C；由 pnpm 和 Turbo 管理子进程。

## 包的构建顺序

```text
postcss-tailwindcss
  → stylelint-plugin-tailwindcss
  → @icebreakers/stylelint-config
  → @icebreakers/eslint-config
  → @icebreakers/monorepo
  → repoctl

eslint-plugin-better-stylelint → @icebreakers/eslint-config
@icebreakers/commitlint-config → @icebreakers/monorepo
@icebreakers/monorepo-templates → @icebreakers/monorepo
@icebreakers/monorepo-templates → create-repoctl → create-icebreaker
```

Lightning CSS 和 changelog 包可以独立构建。同层任务可并行，具体依赖来自各包的 `workspace:` 声明。

包场景使用 `turbo watch build`：首次和后续修改都执行现有 build 任务，按依赖顺序更新产物和类型声明。它不会同时启动互相依赖的独立 tsdown watcher，也不会让下游构建读取正在清理的上游 dist。上游构建失败时，下游不重建；修复文件后自动重试。

等待 Turbo 报告构建成功后，在另一个终端运行 `pnpm exec repo --help`、测试或 mock 的 lint 命令。重建期间不要把残留的旧产物当成成功结果。已有 Node 进程不会自动重新加载导入的模块，需要重新运行消费者。

若只改一个包，可执行：

```bash
pnpm exec turbo watch build --filter=postcss-tailwindcss
```

`build.dependsOn` 的 `^build` 会包含该入口的上游构建，并监听上游变化；如果要观察所有下游消费者，请使用相应场景或 `dev:packages`。不要同时打开范围重叠的包监听场景，以免多个构建进程写入同一个 dist。

## 模板服务与资产同步

client 使用自己的 `worker/` 和同源 `/api/trpc`，无需先启动 server。server 的 Wrangler 和 Node 模式是两个可选运行方式，默认都使用 8787。client 的 Wrangler 配置也声明了 8787；同时调试多个服务时应显式配置不同端口，并以启动日志显示的实际地址为准。不会用固定延时假装服务已经就绪。

修改 `templates/*` 后，在脚手架中验证前执行 `pnpm dev:assets`。普通包监听不会持续复制模板、根配置或 `packages/monorepo/assets`，启动场景时的同步也不能代替后续刷新。不要同时执行多个资产同步进程。

在仓库外的临时目录验证生成项目，避免把业务应用写入本源码工作区。需要验证本地 create 代码时，执行本地构建入口，例如：

```bash
node packages/create-repoctl/dist/cli.mjs /tmp/repoctl-dev-example --yes --templates tsdown
```

`apps/mock` 是 lint 验证消费者，没有 dev 服务。例如配置包构建完成后运行：

```bash
pnpm --filter @icebreakers/mock lint:styles:formatting
```

## 回归验证

遵循 build → lint → typecheck → tsd → test 的顺序。`pnpm test` 包含 `test:dev-scenarios`，也可在构建后单独执行 `pnpm test:dev-scenarios`。场景测试检查实际 Turbo 任务图、构建产物生成的工作区脚本，以及临时工作区中的冷启动、上游修改、失败恢复和子进程清理。

源仓库的 `dev:*` 入口和场景测试不会进入生成项目。生成项目使用 `turbo run dev --concurrency=20`，其 dev 任务先等待 `^build`。若项目常驻任务达到 20 个，需要调高并发上限。
