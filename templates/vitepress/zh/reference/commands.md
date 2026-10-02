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
- 默认保留已有 README 和 tooling 配置。
- 任何初始化写入前先校验 workspace YAML 结构、`packages` 字符串数组和 glob。
- 非空合法清单未声明 `packages` 时（包括 `null`、`{}`）保留 pnpm 隐式 `**` 发现；清单缺失或空白（含仅注释）时创建 `apps/*`、`packages/*`、`examples/*`，已有显式数组则追加缺失的默认规则。
- 无需追加规则时保留清单原文；初始化和创建包的追加都支持以别名作为 `packages` 的键或值，保留注释及其他字段的值和类型，必要时展开引用以保持共享值不变。
- 追加结果在写入前按 pnpm 规则重读，并与完整的计划清单比较。
- `--yes` 用于 CI 或非 TTY 环境。
- 需要重写受管理文件时显式传 `--force` 或 `--overwrite`。

初始化、创建包和 doctor 按当前 pnpm 的 YAML core 规则解释 workspace 清单。
`%YAML 1.1` 不会启用旧式布尔值、八进制、时间戳或 `<<` 合并。
显式非 core 标签（包括 `!!merge`、`!!timestamp`）会在初始化或创建写入前被拒绝，
doctor 则报告状态为 `fail` 的 `workspace-manifest`。普通锚点、别名和注释仍受支持。

`catalog` 和 `catalogs` 还会复用 pnpm 的结构校验，在初始化或创建写入前拒绝
无效映射、非字符串条目及值为 null 的命名 catalog；doctor 同样报告
`workspace-manifest: fail`。pnpm 接受的顶层 `catalog: null`、`catalogs: null`、
空映射、普通别名和空字符串 specifier 仍然有效。

初始化以调用目录为目标，也支持嵌套目录，并保留父 workspace 文件。
包的 `repository.directory` 相对于物理 Git 根目录；README 链接相对于
README 所在的物理目录。默认保留已有 README。
生成的 README 链接支持包路径中的空格、括号、`#`、`?` 和字面百分号；包名按
原文显示，包括 `_`、`*`、`~` 等 Markdown 标点。

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
repo new docs --template vitepress
repo new docs --template vitepress --dry-run
repo new docs --template vitepress --json --out plans/docs.json
```

用途：

- 交互式或直接创建新的 package、app、service、docs 或 CLI。
- `--dry-run` 只预览模板、目标目录、package name 和输出文件。
- `--json` 输出结构化创建计划，隐含 `--dry-run`。
- 显式传入的 `--template` 会先校验，拼错时会失败并提示相近 key。

创建包遇到缺失或空白的 workspace 清单（含仅注释）时，只写入准确目标路径；
`null`、`{}` 或未声明 `packages` 的合法隐式清单保持不变。

生成的 `repository.directory` 相对于物理 Git 根目录，兼容嵌套 workspace，
以及目录别名下尚未创建的目标目录。

如果创建进程中断，可以显式检查并恢复：

```bash
repo recover apps/sdk --dry-run --json
repo recover apps/sdk
repo recover-create apps/sdk
repo new --recover apps/sdk
repo package create --recover apps/sdk
```

`repo recover` 只删除仍与中断时 staging 快照一致的文件，用户编辑、新增文件
和未知状态都会保留。`--dry-run` 不写文件；`--json` 和 `--out <file>` 会隐含
只读预览，并输出稳定的 `status`、`removed`、`preserved`、`targetRemoved` 和
`stagingRemoved` 字段。

如果创建中断前已经提交 `pnpm-workspace.yaml`，只有目标不含用户文件且清单
仍能确认属于本次事务时，恢复才会还原原清单或删除本次新建的清单。清单被编辑
或替换、恢复记录缺失或损坏时，会保留目标与 staging 证据。用户文件会保留其
workspace inclusion。可选的 `manifest` 结果包含 `path`、`status` 和可选
`reason`；不同语言均保持 `unchanged`、`would-restore`、`restored`、`preserved`
或 `unknown` 状态值。旧标记支持只恢复目标目录，清单状态为 `unknown`。预览
恢复不会修改清单。

创建其他包时，只要旧目标仍存在或状态无法确认，就会保留旧 staging 快照。只有确定目标已不存在，才会自动清理过期 staging。

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

pre-push 默认发现 pnpm 包。程序化调用 `verifyPrePush({ cwd, workspaces })`
还接受相对路径、物理绝对路径和目录别名，按物理身份匹配，并排除显式 `cwd`
边界以外的路径。

hook 输入包含推送 ref 时，按剥离 tag 后的 commit 去重，在临时本地克隆中读取
该提交的 workspace、清单和脚本进行验证。存在依赖或安装生命周期脚本时，先在
克隆内执行 `pnpm install --frozen-lockfile`；无依赖的校验跳过安装。
失败或收到 SIGINT/SIGTERM 后，清理本次克隆再退出，原工作树和暂存区保持不变。
空输入及仅删除 ref 的推送仍在本地执行 lint/typecheck。

## `repo upgrade`

```bash
repo upgrade
repo upgrade --dry-run
repo upgrade --json
repo upgrade --diff
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

`--dry-run` 预览文件操作、原因、确认要求和迁移依赖，不修改目标工程或弹出提示。`--json` 和 `--diff` 同样隐含预览：JSON 保持稳定的机器可读字段，`--diff` 提供有界文本差异。程序化调用可从 `repoctl` 导入 `resolveUpgradePlan(opts)` 获取同一份计划。默认保留自定义发布工作流，旧状态仅在关联迁移成功后删除。

如果升级配置的 targets 或交互选择未包含必需的迁移文件，旧发布状态会保留，计划会报告 `migration-targets-not-selected`。完整迁移需包含 `package.json`、`pnpm-workspace.yaml` 和旧发布工作流；已经受管的发布工作流可以作为不修改的依赖。

升级与发布迁移复用相同的 pnpm 清单和 catalog 校验，保留已有隐式 `**` 发现及元数据值和类型（包括 `%YAML 1.1` 下的 `on` 和显式标记的整数）；校验失败、拒绝覆盖或保留自定义工作流时，旧发布配置和预发布状态也会保留。清单无变化时保留原文；有变化时使用格式化 YAML，并校验其值和类型与计划一致。

如果升级进程中断，请先通过导出的 `inspectUpgradeTransactions(cwd)` API 检查
待处理事务，再重试。未完成的 journal 会标记为 `needs-review`，在检查受影响
文件前阻止下一次升级。

可使用 `inspectUpgradeLock(cwd)` 只读检查升级锁，状态包括 `missing`、`active`、
`stale` 和 `malformed`。只有 `stale` 锁会在后续升级中自动回收，其他状态应先人工检查。

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
