# 安装并初始化

这一页按“把 repoctl 接进一个仓库”的顺序写。你不需要先理解所有工具，先让仓库能被诊断、能创建包、能跑提交前校验。

## 准备环境

- Node.js 22.13 或更高版本。
- pnpm。推荐通过 Corepack 启用：`corepack enable`。
- Git。`repo doctor` 会读取仓库信息，用来补全 package metadata 和诊断提交链路。

Cloudflare 模板额外要求 Node.js 22.18+，用于加载 cf 配置。

```bash
node -v
pnpm -v
git --version
```

## 安装 repoctl

```bash
pnpm add -D repoctl
```

如果你使用 `create-repoctl` 创建新仓库，依赖和根脚本通常已经准备好了，可以直接从 `pnpm install` 开始。

## 初始化仓库默认值

```bash
pnpm install
pnpm exec repo init
pnpm exec repo doctor
```

这三步分别解决：

| 命令           | 作用                                                |
| -------------- | --------------------------------------------------- |
| `pnpm install` | 安装 workspace 依赖并创建本地链接                   |
| `repo init`    | 补齐推荐根脚本、workspace patterns 和基础工具链入口 |
| `repo doctor`  | 检查根目录、Node 版本、CLI 依赖、遗留配置和提交链路 |

如果 `doctor` 报错，先按输出里的 `fix:` 处理。处理完再跑一次 `pnpm exec repo doctor`。

## 创建第一个包

先看模板列表：

```bash
pnpm exec repo templates
```

创建一个 TypeScript 库：

```bash
pnpm exec repo new sdk --template tsdown
```

创建前只想预览：

```bash
pnpm exec repo new sdk --template tsdown --dry-run
pnpm exec repo new sdk --template tsdown --json --out plans/sdk.json
```

`--json` 和 `--out` 会隐含 `--dry-run`，适合 CI、编辑器和脚本读取创建计划。

## 使用根脚本

如果仓库已经通过 `repo init` 或模板生成补齐了根脚本，日常可以写得更短：

```bash
pnpm run repo:init
pnpm run repo:doctor -- --json
pnpm run repo:new -- sdk --template tsdown
pnpm run repo:check
```

对应关系：

| 根脚本                         | 等价命令                     |
| ------------------------------ | ---------------------------- |
| `pnpm run repo:init`           | `pnpm exec repo init`        |
| `pnpm run repo:doctor -- args` | `pnpm exec repo doctor args` |
| `pnpm run repo:new -- args`    | `pnpm exec repo new args`    |
| `pnpm run repo:check`          | `pnpm exec repo check`       |

## 提交前检查

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

如果只想走 repoctl 推荐的本地检查入口：

```bash
pnpm run repo:check
pnpm exec repo check --dry-run
pnpm exec repo check --json --out reports/check-plan.json
```

## 同步模板标准资产

当模板升级后，用 `upgrade` 同步新的默认配置和脚本：

```bash
pnpm exec repo upgrade
pnpm exec repo upgrade --no-overwrite
pnpm exec repo upgrade --yes
```

- `--no-overwrite`：保留已有 drifted 文件。
- `--yes` / `--overwrite`：适合明确要覆盖标准资产的自动化场景。
- 非 TTY 环境不会弹出交互提示。

## 常见下一步

- 已有仓库渐进接入：阅读 [接入已有仓库](/zh/tasks/adopt-existing)。
- 想固定默认模板：阅读 [配置文件](/zh/reference/config)。
- 想查看所有模板：阅读 [模板与创建](/zh/reference/templates)。
- 想把诊断结果发给同事：阅读 [排障](/zh/tasks/troubleshooting)。
