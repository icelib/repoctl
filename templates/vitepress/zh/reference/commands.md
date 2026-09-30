# 命令速查

这一页只保留 repoctl 高频、实用、容易记错的命令。

## 最推荐入口

```bash
pnpm exec repo init
pnpm exec repo doctor
pnpm exec repo templates
pnpm exec repo new
pnpm exec repo check
```

模板生成仓库里的推荐根脚本：

```bash
pnpm run repo:init
pnpm run repo:doctor
pnpm run repo:new
pnpm run repo:check
```

## `repo init`

```bash
repo init
repo init --yes
repo init --preset minimal
repo init --preset standard --force
repo init --overwrite
```

用途：

- 初始化当前 workspace 的推荐默认值。
- 默认不覆盖已有 README、package.json、pnpm-workspace.yaml 和 tooling 配置。
- 追加缺失的 `apps/*`、`packages/*`、`examples/*` workspace patterns。
- `--yes` 用于 CI 或非 TTY 环境。
- 需要重写受管理文件时显式传 `--force` 或 `--overwrite`。

## `repo doctor`

```bash
repo doctor
repo doctor --strict
repo doctor --json
repo doctor --json --out reports/doctor.json
repo doctor --markdown --redact --out reports/doctor.md
```

用途：

- 诊断当前目录是不是可直接开始使用的 monorepo 根目录。
- 检查 Node 版本、workspace 文件、CLI 依赖、根脚本、遗留配置和提交链路。
- `--strict` 会把 warning 也视为失败，适合 CI 门禁。
- `--json` 和 `--markdown` 适合自动化、PR、issue 和外部协作。
- `--redact` 会脱敏 workspace、cwd、home 等绝对路径。

## `repo templates`

```bash
repo templates
repo templates tsdown
repo templates --category library
repo templates --check
repo templates --json
repo templates --markdown --out docs/templates.md
```

用途：

- 查看内置模板 key、分类、默认生成目录和用途。
- 检查模板元数据和源目录健康状态。
- 给脚本读取 JSON，或生成 Markdown 文档片段。

## `repo new`

```bash
repo new
repo new sdk --template tsdown
repo new docs --template nimbus
repo new docs --template nimbus --dry-run
repo new docs --template nimbus --json --out plans/docs.json
```

用途：

- 交互式或直接创建新的 package、app、service、docs 或 CLI。
- `--dry-run` 只预览模板、目标目录、package name 和输出文件。
- `--json` 输出结构化创建计划，隐含 `--dry-run`。
- 显式传入的 `--template` 会先校验，拼错时会失败并提示相近 key。

## `repo check`

```bash
repo check
repo check --staged
repo check --full
repo check --edit-file .git/COMMIT_EDITMSG
repo check --dry-run
repo check --json --out reports/check-plan.json
repo check --markdown --redact --out reports/check-plan.md
```

用途：

- 运行推荐的本地校验入口。
- `--staged` 偏 pre-commit。
- `--full` 偏 pre-push。
- `--edit-file` 用于 commit message 校验。
- `--dry-run` 只预览将要执行的校验。

## `repo upgrade`

```bash
repo upgrade
repo upgrade --yes
repo upgrade --overwrite
repo upgrade --no-overwrite
repo upgrade --core
repo upgrade -i
repo upgrade -s
```

用途：

- 同步仓库标准资产与脚本。
- `--core` 只同步核心配置，跳过 GitHub 相关资产。
- `-i` 交互式选择。
- `--no-overwrite` / `-s` 保留已有 drifted 文件。
- `--yes` / `--overwrite` 非交互覆盖 drifted 标准资产。

## 分组命令

```bash
repo ws ls
repo ws ls --json --out reports/workspaces.json
repo ws up
repo tg init --all
repo verify pre-commit
repo verify pre-push
repo env support --markdown --redact --out reports/support.md
repo config inspect
repo skills sync --codex
```

分组命令适合维护者和自动化脚本。日常开发优先使用顶层命令。

## 输出参数速查

| 参数           | 适用命令                                     | 说明                                  |
| -------------- | -------------------------------------------- | ------------------------------------- |
| `--json`       | `doctor`、`check`、`templates`、`new`、`env` | 输出机器可读数据                      |
| `--markdown`   | `doctor`、`check`、`templates`、`env`        | 输出适合 PR 和 issue 的 Markdown      |
| `--out <file>` | 多数报告和计划命令                           | 写入文件，便于 CI artifact 或脚本读取 |
| `--redact`     | `doctor`、`check`、`env`                     | 分享报告前脱敏本机路径                |
| `--strict`     | `doctor`、`env snapshot`、`env support`      | warning 也会导致失败                  |
| `--dry-run`    | `check`、`new`                               | 只看计划，不执行校验或写入文件        |

## 继续阅读

- [执行模型](./execution-model.md)
- [运行校验](/zh/tasks/checks)
- [doctor 诊断](/zh/start/diagnose)
- [把校验加入 CI](/zh/tasks/ci)
- [报告与自动化输出](/zh/tasks/reports)
- [命令别名](./aliases.md)
