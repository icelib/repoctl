---
description: 说明 repoctl doctor 的检查项、状态含义、strict 模式和修复建议。
---

# repoctl doctor 诊断

`repo doctor` 用来判断当前目录是不是一个可维护、可开发、可接入 repoctl 工作流的 pnpm monorepo 根目录。默认只读、离线，不执行 pnpm/Corepack、不激活或下载包管理器、不安装依赖、不修改清单或锁文件；显式 `--out` 仅写出指定报告。

## 1. 状态含义

| 状态   | 含义           | 对退出码的影响                |
| ------ | -------------- | ----------------------------- |
| `pass` | 检查通过       | 不影响                        |
| `warn` | 存在建议修复项 | 默认不失败，`--strict` 下失败 |
| `fail` | 阻塞项         | 命令返回失败状态              |

CI 中推荐使用：

```bash
repo doctor --strict
```

这样 warning 不会长期堆积成隐性风险。

## 2. 核心检查项

| 检查项                       | 通过标准                                                         | 常见修复                                     |
| ---------------------------- | ---------------------------------------------------------------- | -------------------------------------------- |
| `package-json`               | 当前 workspace 根目录存在 `package.json`                         | 回到仓库根目录或先初始化项目                 |
| `workspace-manifest`         | 存在 `pnpm-workspace.yaml`                                       | `repo init --yes`                            |
| `node-version`               | 当前 Node 满足 `engines.node`                                    | 切换 Node 版本或补充 engines                 |
| `node-version-files`         | 已有 `.nvmrc`、`.node-version` 与 Node、engines 彼此一致         | 统一数字版本声明；别名无法离线解析时为 warn  |
| `package-manager`            | 根 `packageManager` 固定 pnpm 版本                               | 设置 `pnpm@<版本>`                           |
| `pnpm-version`               | 观测到的 pnpm 与声明一致                                         | 手动选择 pnpm 后运行 `pnpm exec repo doctor` |
| `lockfile-sync`              | 根及 workspace 清单依赖与锁文件一致                              | 检查变更，再手动执行 `pnpm install`          |
| `installation-state`         | pnpm 元数据、安装锁文件和必需的直接依赖清单一致                  | 手动使用声明版本重新安装                     |
| `tool-package`               | 根依赖包含 `repoctl`                                             | `pnpm add -D repoctl`                        |
| `root-scripts`               | 存在 `repo:init`、`repo:new`、`repo:check`、`repo:doctor` 根脚本 | `repo init --yes`                            |
| `config-file`                | 使用 `repoctl.config.ts`，且没有残留 `monorepo.config.ts`        | 保留 `repoctl.config.ts`                     |
| `commit-hooks`               | Husky 和 lint-staged 同时就绪                                    | `repo upgrade --yes`                         |
| `tooling-imports`            | 配置不再引用本地源码 loader 或旧 config wrapper                  | `repo upgrade --yes`                         |
| `workspace-patterns`         | 常见目录被 workspace patterns 覆盖                               | `repo init --yes`                            |
| `workspace-package-coverage` | 常见目录下的包都被 pnpm 覆盖                                     | `repo init --yes`                            |

Node 版本文件可选，不存在时无需新增。数字版本冲突为 `fail`，无法解析的 `lts/*` 等别名为 `warn`。`warn` 也表示证据不足，不意味着已经确认健康。

建议通过 `pnpm exec repo doctor` 提供 pnpm 启动证据。报告会标记继承的 `npm_config_user_agent` 来源，这类证据可能被覆盖或过时。独立调用时，仅静态读取 PATH 上可识别的 pnpm 包元数据；Corepack shim 或无法识别的独立启动器返回未知，不执行启动器。`env info`、snapshot 和 support 也使用相同观测方式。

锁文件检查支持 pnpm v9 格式，包括 pnpm 12 的独立包管理器文档、workspace 协议、默认和命名 catalog，以及自动安装的 peer（显式依赖类型优先）。Workspace override 配置独立于清单依赖声明进行对照。明确的清单不匹配为 `fail`，缺失/损坏/不支持的格式或无法验证的 override、pnpmfile 转换为 `warn`。安装检查支持使用 isolated node linker 的 pnpm layout version 5，读取 `.modules.yaml` 中的 virtual store 路径，比较锁文件记录并检查必需的直接依赖清单。未安装、部分安装、只有 node_modules 却无可识别元数据均为 `warn`；版本、锁文件或直接依赖明确不一致为 `fail`。检查不验证所有包内容、传递依赖链接、平台可选依赖、生命周期脚本或外部 store 完整性。

## 3. 输出报告

```bash
repo doctor
repo doctor --json
repo doctor --markdown --redact
repo doctor --json --out reports/doctor.json
repo doctor --markdown --redact --out reports/doctor.md
```

自动化脚本推荐使用 `pnpm run repo:doctor -- --json` 或 `pnpm exec repo doctor --json`。

| 输出         | 适合场景                    |
| ------------ | --------------------------- |
| 默认交互文本 | 本地直接阅读                |
| JSON         | CI、编辑器、脚本消费        |
| Markdown     | 粘贴到 issue、PR 或排障文档 |
| `--redact`   | 分享报告前隐藏本机绝对路径  |

## 4. strict 模式

`--strict` 会把 warning 也视为失败。它适合放在 CI 早期阶段：

```bash
pnpm install --frozen-lockfile
repo doctor --strict
repo check --full
```

如果你正在接入存量仓库，建议先不用 strict，把报告保存下来逐项修复：

```bash
repo doctor --markdown --redact --out reports/doctor.md
repo upgrade --no-overwrite
repo doctor
```

## 5. 排查顺序

建议按阻塞程度处理：

1. 先处理 `fail`，否则命令或 CI 很可能无法继续。
2. 再处理遗留配置和 Node 版本问题。
3. 然后补根脚本、hook 和 lint-staged。
4. 最后整理 workspace patterns 与 tooling imports。

如果不确定报告能否安全分享，使用 [报告与自动化输出](/zh/tasks/reports) 里的 `--redact` 和 `env support`。
