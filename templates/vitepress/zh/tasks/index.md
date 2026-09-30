# 任务索引

如果你不确定该用哪个 repoctl 命令，先从这一页开始。

## 我刚拿到一个仓库

```bash
pnpm install
pnpm run repo:doctor
```

如果 `repo:*` 根脚本还不存在：

```bash
pnpm add -D repoctl
pnpm exec repo init --yes
pnpm exec repo doctor
```

继续看：[安装并初始化](/zh/start/install)。

## 我要把 repoctl 接入旧仓库

```bash
pnpm add -D repoctl
pnpm exec repo init --yes
pnpm exec repo doctor --markdown --redact --out reports/doctor-before.md
pnpm exec repo upgrade --no-overwrite
pnpm exec repo doctor --markdown --redact --out reports/doctor-after.md
```

继续看：[接入已有 workspace](/zh/tasks/adopt-existing)。

## 我要创建新包或应用

```bash
pnpm exec repo templates
pnpm exec repo new sdk --template tsdown
pnpm exec repo new docs --template nimbus --dry-run
```

如果只是日常开发，根脚本也可以：

```bash
pnpm run repo:new -- sdk --template tsdown
```

继续看：[模板与创建](/zh/reference/templates)。

## 我要提交前自查

```bash
pnpm run repo:check
pnpm exec repo check --dry-run
pnpm exec repo check --full
```

如果你想保存计划：

```bash
pnpm exec repo check --json --out reports/check-plan.json
pnpm exec repo check --markdown --redact --out reports/check-plan.md
```

继续看：[把校验加入 CI](/zh/tasks/ci)。

## 我要调试 CI 或同事机器问题

```bash
pnpm exec repo doctor --markdown --redact --out reports/doctor.md
pnpm exec repo env support --markdown --redact --out reports/support.md
pnpm exec repo env snapshot --json --out reports/snapshot.json
```

继续看：[排障](/zh/tasks/troubleshooting)。

## 我要同步模板标准资产

```bash
pnpm exec repo upgrade --no-overwrite
pnpm exec repo upgrade --yes
pnpm exec repo upgrade --core
```

选择建议：

| 目标                     | 命令                          |
| ------------------------ | ----------------------------- |
| 第一次接入，保留已有配置 | `repo upgrade --no-overwrite` |
| 明确要覆盖标准资产       | `repo upgrade --yes`          |
| 只同步核心配置           | `repo upgrade --core`         |

## 我要看 workspace 结构

```bash
pnpm exec repo ws ls
pnpm exec repo ws ls --json --out reports/workspaces.json
pnpm exec repo ws ls --markdown --redact --out reports/workspaces.md
```

## 我要看配置是否生效

```bash
pnpm exec repo config inspect
pnpm exec repo cfg i --json --out reports/config.json
```

继续看：[配置文件](/zh/reference/config)。

## 我要写更短的命令

```bash
repo tpl
repo ws ls
repo e support --markdown --redact
repo cfg i
```

继续看：[命令别名](/zh/reference/aliases)。
