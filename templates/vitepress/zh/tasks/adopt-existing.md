# 接入已有 workspace

## 适用场景

当 workspace 已经有脚本、hooks 或配置，需要保留现有约定并逐步接入 repoctl 时，使用这个任务。

## 前置条件

- 在 workspace 根目录执行命令。
- 提交或暂存与本次接入无关的本地改动。
- 确认 Node.js 22.13 或更新版本以及 pnpm 可用。

## 最小命令

```bash
repo doctor --markdown --redact --out reports/baseline.md
```

## 预期输出

报告会记录包管理器、workspace 结构、任务运行器、工具文件和发布设置，并隐藏本地路径。

## 常见分支

- 现有约定健康：保留它们，只补齐缺少的受管资产。
- 文件已经由本地管理：使用 `repo upgrade --no-overwrite` 并检查差异。
- tooling 分散在多个 loader：先统一 loader，再重新运行诊断。

repoctl 不只适合新模板仓库。它也可以渐进接入已有 pnpm workspace，用诊断报告和非覆盖同步把风险降下来。

## 适合接入的仓库

优先满足这些条件：

- 已经使用 pnpm 或准备迁移到 pnpm。
- 有根 `package.json`。
- 能接受 `apps/*`、`packages/*`、`examples/*` 这类 workspace 目录约定。
- 希望统一 `repo:init`、`repo:doctor`、`repo:new`、`repo:check` 这类日常入口。

如果仓库还不是 pnpm workspace，先补最小 `pnpm-workspace.yaml`：

```yaml
packages:
  - apps/*
  - packages/*
```

## 第一步：安装并初始化

```bash
pnpm add -D repoctl
pnpm exec repo init --yes
```

`repo init --yes` 会在写入初始化文件前校验 workspace 清单，为显式数组或缺失、空白的清单补齐默认规则。创建包遇到缺失或空白清单（含仅注释）时只写入准确目标路径。两者均保留 `null`、`{}` 或未声明 `packages` 的合法清单所采用的隐式 `**` 发现，无需追加时保留原文。已有 README 和 tooling 配置默认保留。

追加支持以别名作为 `packages` 的键或值，保留注释及其他字段的值和类型，必要时展开引用以保持共享值不变。写入前按 pnpm 规则重读序列化结果，并与完整的计划清单比较。

初始化、创建包和 doctor 按当前 pnpm 的 YAML core 规则解释清单。
`%YAML 1.1` 不会启用旧式布尔值、八进制、时间戳或 `<<` 合并。
显式非 core 标签（如 `!!merge`、`!!timestamp`）会在初始化或创建写入前被拒绝，
doctor 则报告状态为 `fail` 的 `workspace-manifest`。普通锚点、别名和注释仍受支持。

`catalog` 和 `catalogs` 还会复用 pnpm 的结构校验，在初始化或创建写入前拒绝
无效映射、非字符串条目及值为 null 的命名 catalog；doctor 同样报告
`workspace-manifest: fail`。pnpm 接受的顶层 `catalog: null`、`catalogs: null`、
空映射、普通别名和空字符串 specifier 仍然有效。

## 第二步：保存第一次诊断

```bash
pnpm exec repo doctor --markdown --redact --out reports/doctor-before.md
pnpm exec repo doctor --json --out reports/doctor-before.json
```

建议把第一次报告提交到 PR 评论或 artifact，而不是只看终端输出。

重点看这些项：

| 检查项                       | 常见问题                                         |
| ---------------------------- | ------------------------------------------------ |
| `package-json`               | 当前目录不是仓库根目录                           |
| `workspace-manifest`         | 缺少 `pnpm-workspace.yaml`                       |
| `node-version`               | 根 package 没声明 `engines.node` 或版本不匹配    |
| `tool-package`               | 没安装 `repoctl`                                 |
| `root-scripts`               | 缺少 `repo:init/repo:new/repo:check/repo:doctor` |
| `config-file`                | 残留已废弃的 `monorepo.config.ts`                |
| `commit-hooks`               | Husky 和 lint-staged 只接了一半                  |
| `workspace-package-coverage` | package.json 没被 workspace patterns 覆盖        |

## 第三步：保守同步标准资产

```bash
pnpm exec repo upgrade --no-overwrite
pnpm exec repo doctor --markdown --redact --out reports/doctor-after.md
```

`--no-overwrite` 适合第一次接入：它同步缺失资产，但保留已有 drifted 文件。你可以在 PR diff 里逐项看哪些配置要进一步迁移。

升级与发布迁移复用相同的 pnpm 清单和 catalog 校验，保留已有隐式 `**` 发现及元数据值和类型（包括 `%YAML 1.1` 下的 `on` 和显式标记的整数）；校验失败、拒绝覆盖或保留自定义工作流时，旧发布配置和预发布状态也会保留。清单无变化时保留原文；有变化时使用格式化 YAML，并校验其值和类型与计划一致。

## 第四步：预览校验计划

```bash
pnpm exec repo check --dry-run
pnpm exec repo check --json --out reports/check-plan.json
pnpm exec repo check --markdown --redact --out reports/check-plan.md
```

先看 plan，再决定要不要接入 hook 或 CI。

## 第五步：接入根脚本

如果 `repo init` 已补齐根脚本，团队日常文档优先改成：

```bash
pnpm run repo:doctor
pnpm run repo:new -- sdk
pnpm run repo:check
```

CI 和自动化脚本仍建议写完整 CLI：

```bash
pnpm exec repo doctor --strict
pnpm exec repo check --full
```

## 第六步：处理遗留配置

### 遗留配置文件

只保留：

```txt
repoctl.config.ts
```

`monorepo.config.ts` 已不再加载；请改名为 `repoctl.config.ts`。

### 本地 tooling loader

如果 `doctor` 提示 tooling 配置引用了本地源码 loader，使用：

```bash
pnpm exec repo upgrade --yes
```

这个命令会迁移到 `repoctl/tooling` 入口。简单的 `@icebreakers/commitlint-config`、`@icebreakers/eslint-config`、`@icebreakers/stylelint-config` wrapper 也会被保守转换为 `repoctl/tooling`，复杂 ESLint 配置会保留原有 rules、ignores、overrides 和额外 flat config 语义。

### workspace patterns 不覆盖包

运行：

```bash
pnpm exec repo init --yes
```

为显式 `packages` 数组补齐缺失的默认规则。其他目录布局需手动扩展 `pnpm-workspace.yaml`。非空合法清单未声明 `packages` 时已采用 pnpm 隐式 `**` 发现，会保持不变。

## 推荐 PR 结构

存量仓库接入建议拆成小 PR：

1. 安装 `repoctl`，补 `init/doctor/new/check` 根脚本。
2. 提交 `doctor-before` 和 `doctor-after` 报告。
3. 同步或迁移 tooling 配置。
4. 接入 hook 和 CI。
5. 用 `repo new --dry-run` 验证模板创建路径。

## 下一步

- [把校验加入 CI](/zh/tasks/ci)
- [排障](/zh/tasks/troubleshooting)
- [配置文件](/zh/reference/config)
