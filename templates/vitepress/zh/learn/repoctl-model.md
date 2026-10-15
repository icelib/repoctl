# repoctl 概览

`repoctl` 是面向 pnpm 与 Turborepo monorepo 的任务型 CLI。默认命令是 `repo`，目标是把初始化、诊断、创建、校验、升级和发布收敛到一组稳定入口里。

它不替代 pnpm、Turbo 或 pnpm versioning，而是把这些工具在 monorepo 里的常见动作串起来。

## 什么时候使用 repoctl

| 场景                                     | 推荐入口                 |
| ---------------------------------------- | ------------------------ |
| 给已有 pnpm workspace 补齐标准脚本和配置 | `pnpm exec repo init`    |
| 判断当前仓库是不是能顺利开发             | `pnpm exec repo doctor`  |
| 创建新的包、应用、文档站或 CLI           | `pnpm exec repo new`     |
| 提交前复现推荐校验链路                   | `pnpm exec repo check`   |
| 同步模板最新标准资产                     | `pnpm exec repo upgrade` |
| 给 CI、编辑器或脚本读取结构化结果        | `--json --out <file>`    |

## 推荐命令层级

### 1. 生成仓库里的 repo:\* 根脚本

```bash
pnpm run repo:init
pnpm run repo:doctor
pnpm run repo:new
pnpm run repo:check
```

这是给日常开发和团队文档使用的入口。短、稳定、不需要先解释 CLI 包名，也不会和 pnpm 内置命令冲突。

### 2. 明确调用 repo CLI

```bash
pnpm exec repo init
pnpm exec repo doctor
pnpm exec repo templates
pnpm exec repo new sdk --template tsdown
pnpm exec repo check --dry-run
```

这是文档、CI、脚本和排障里最清楚的写法。

### 3. 分组命令

```bash
pnpm exec repo ws ls
pnpm exec repo tg init --all
pnpm exec repo env support --markdown --redact
pnpm exec repo config inspect
```

这些入口适合已经熟悉 repoctl 的维护者，用来做更细的 workspace、tooling、环境和配置操作。

## repoctl 管什么

repoctl 把 monorepo 里最容易分散的动作收敛为五条主线：

| 主线   | 代表命令                      | 解决的问题                                                |
| ------ | ----------------------------- | --------------------------------------------------------- |
| 初始化 | `repo init` / `repo upgrade`  | 生成或同步 workspace、根脚本、Lefthook 等资产             |
| 诊断   | `repo doctor`                 | 判断仓库根目录、运行时、脚本、配置和提交链路是否就绪      |
| 创建   | `repo templates` / `repo new` | 使用内置模板生成库、应用、服务、文档站和 CLI              |
| 校验   | `repo check` / `repo verify`  | 统一 pre-commit、staged typecheck、pre-push 和 commit-msg |
| 报告   | `repo env support`            | 输出可保存、可脱敏、可给 CI 和协作者读取的上下文          |

这几条主线都支持非交互参数。需要自动化时，优先使用 `--json`、`--markdown`、`--out <file>`、`--redact` 和 `--dry-run` 组合。

## 新人和维护者的边界

| 角色       | 推荐只记住                                                         | 需要深入时再看                                                                |
| ---------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| 新成员     | `pnpm run repo:doctor`、`pnpm run repo:new`、`pnpm run repo:check` | [任务索引](/zh/tasks/)                                                        |
| 包维护者   | `repo templates`、`repo new --template`、`repo check --full`       | [模板资产治理](/zh/reference/template-assets)                                 |
| CI 维护者  | `repo doctor --strict`、`repo check --full`、`repo env support`    | [报告与自动化输出](/zh/tasks/reports)                                         |
| 平台维护者 | `repo init`、`repo upgrade`、`repo config inspect`                 | [执行模型](/zh/reference/execution-model) 和 [配置文件](/zh/reference/config) |

## 命令入口

`repoctl` 包提供多个 bin，例如：

```bash
pnpm exec repoctl doctor
pnpm exec repoctl new
```

文档统一推荐 `repo`，是为了减少新人需要记住的名字。底层实现来自同一套 CLI。

## 下一步

- 第一次接入：[安装并初始化](/zh/start/install)
- 不知道用哪个命令：[任务索引](/zh/tasks/)
- 理解 CLI 怎么执行：[执行模型](/zh/reference/execution-model)
- 查命令参数：[命令速查](/zh/reference/commands)
- 理解本地校验：[运行校验](/zh/tasks/checks)
- 看 doctor 具体检查项：[doctor 诊断](/zh/start/diagnose)
- 固化团队默认值：[配置文件](/zh/reference/config)
- 看可创建的模板：[模板与创建](/zh/reference/templates)
- 治理模板资产：[模板资产治理](/zh/reference/template-assets)
- 接入 CI 和本地流程：[把校验加入 CI](/zh/tasks/ci)
- 生成机器可读报告：[报告与自动化输出](/zh/tasks/reports)
- 排查常见问题：[排障](/zh/tasks/troubleshooting)
- 熟悉短命令：[命令别名](/zh/reference/aliases)
