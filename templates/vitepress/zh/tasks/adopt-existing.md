# 接入已有 workspace

## 适用场景

当 workspace 已经有脚本、hooks 或配置，需要保留现有约定并逐步接入 repoctl 时，使用这个任务。

## 前置条件

- 在 workspace 根目录执行命令。
- 提交或暂存与本次接入无关的本地改动。
- 确认 Node.js 满足 `^22.23.4 || ^24.22.1 || >=26.12.1`（推荐 24.22.1 LTS），并且 pnpm 可用。

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

`repo init --yes` 会使用安全默认值。它会补齐推荐脚本和 workspace patterns，但不会无条件覆盖已有 README、package.json、pnpm-workspace.yaml 或 tooling 配置。

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
| `commit-hooks`               | Lefthook 只接了一半                              |
| `workspace-package-coverage` | package.json 没被 workspace patterns 覆盖        |

## 第三步：保守同步标准资产

```bash
pnpm exec repo upgrade --no-overwrite
pnpm exec repo doctor --markdown --redact --out reports/doctor-after.md
```

`--no-overwrite` 适合第一次接入：它同步缺失资产，但保留已有 drifted 文件。你可以在 PR diff 里逐项看哪些配置要进一步迁移。

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

或手动扩展 `pnpm-workspace.yaml`。

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

复杂仓库可继续阅读 [复用发布与 hooks 自动化](./adoption)：以声明式策略替代自动 changeset、正式 Release PR 校验和 hooks 安装器的通用脚本。
