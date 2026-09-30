---
description: 说明 repoctl CLI 的入口层级、命令懒加载、非交互输出和脚本集成方式。
---

# repoctl 执行模型

repoctl 的核心设计是把日常入口保持短，把细粒度能力放到分组命令里，并让 CI、编辑器和脚本可以读取结构化输出。

## 1. 入口层级

| 层级        | 示例                                                               | 使用场景                       |
| ----------- | ------------------------------------------------------------------ | ------------------------------ |
| 根脚本      | `pnpm run repo:doctor`、`pnpm run repo:new`、`pnpm run repo:check` | 团队日常开发、README、贡献指南 |
| `repo` 命令 | `pnpm exec repo doctor`                                            | 文档、CI、脚本、排障           |
| 分组命令    | `repo env support`、`repo verify pre-push`                         | 维护者、自动化和集成工具       |

## 2. 命令执行过程

repoctl 启动时只注册命令树。具体实现会在 action 执行时再加载，因此查看帮助和列出命令不会提前扫描所有 workspace、Git 状态和模板文件。

```txt
repo --help
  -> 注册命令树
  -> 输出帮助

repo doctor
  -> 注册命令树
  -> 加载 doctor 实现
  -> 发现 workspace
  -> 输出诊断报告
```

这种模型适合命令数量较多的 monorepo 工具：日常命令保持快，重逻辑只在真正执行时进入。

## 3. 输出模式

很多 repoctl 命令都同时服务人和机器：

| 参数           | 行为                             | 典型用途                 |
| -------------- | -------------------------------- | ------------------------ |
| `--json`       | 输出结构化 JSON                  | CI、编辑器、脚本         |
| `--markdown`   | 输出 Markdown 报告               | issue、PR、协作文档      |
| `--out <file>` | 写入文件                         | 保存 artifact 或生成计划 |
| `--redact`     | 脱敏 cwd、workspace、home 等路径 | 分享本机报告             |
| `--dry-run`    | 只生成计划，不写入业务文件       | 审查创建和校验动作       |

`--json`、`--markdown`、`--out` 在 `repo check` 和 `repo new` 这类命令里会隐含预览语义，避免自动化读取计划时意外执行写入。

## 4. 失败状态

repoctl 的失败状态遵循阻塞优先：

| 命令                     | 什么时候失败                                          |
| ------------------------ | ----------------------------------------------------- |
| `repo doctor`            | 存在 `fail` 检查项；加 `--strict` 时 warning 也会失败 |
| `repo templates --check` | 模板健康检查出现 fail                                 |
| `repo new`               | 模板不存在、目标校验失败或写入失败                    |
| `repo check --full`      | 任一 root script 校验失败                             |
| `repo verify *`          | 对应 hook 或校验命令失败                              |

如果只是想知道会发生什么，先加 `--dry-run` 或输出计划：

```bash
repo new docs --template nimbus --json --out plans/docs.json
repo check --markdown --out reports/check-plan.md
```

## 5. 和配置文件的关系

repoctl 会从 workspace 根目录加载 `repoctl.config.*`。`monorepo.config.*` 已不再加载。

配置加载后会影响具体命令，例如：

| 配置区域           | 影响命令                                                            |
| ------------------ | ------------------------------------------------------------------- |
| `commands.init`    | `repo init`                                                         |
| `commands.create`  | `repo new`                                                          |
| `commands.upgrade` | `repo upgrade`                                                      |
| `tooling`          | `repoctl/tooling` wrapper 生成的 ESLint、Vitest、lint-staged 等配置 |

更多配置示例见：[配置文件](./config.md)。
