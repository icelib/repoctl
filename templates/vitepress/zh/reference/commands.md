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

```bash
repo doctor --list-rules
repo doctor --rules root-scripts,package-manager --strict
repo doctor --rules root-scripts --fix --out plans/doctor-fix.json
repo doctor --apply plans/doctor-fix.json --json
```

`--rules` 在执行前选择精确、稳定的检查 ID；未知 ID 会失败并列出可用规则。CLI 会替换 `commands.doctor.rules`；省略规则时执行全部检查，配置中显式空数组表示不执行检查。共享的文件发现和规则前置读取仍会执行。`manifest-health` 是静态清单检查的汇总规则。

在 `commands.doctor.suppressions` 配置有理由的抑制。每项必须提供 `id` 与非空 `reason`，可选 `path` 精确匹配 workspace 相对文件路径。可选 `expires` 使用 UTC 日期 `YYYY-MM-DD`，到期当天仍有效。JSON 保留原始发现的状态、`suppression`、`rawSummary`，以及全部抑制记录及命中数量。仅有效抑制从 `summary` 和 strict 退出码中排除；过期与未命中的记录仍会展示。

`--fix` 仅输出 JSON 预览，不修改项目文件。首批修复器只补根 `package.json` 中缺失的 `repo:init`、`repo:new`、`repo:check`、`repo:doctor` 键。已有值（包括空值和自定义脚本）保留，由用户人工核查。未选择或有效抑制的规则不会生成修复。审核新增脚本、完整前后内容、哈希、风险与 diff 后，用 `--apply` 应用。计划包含原始清单内容，不支持脱敏或 Markdown 转换后执行。

应用时复核规范化 workspace 与原始文件内容，拒绝链接文件和篡改的操作，复用暂存写入及回滚事务，再无抑制地运行根脚本检查。输入内容改变会停止修复，需要重新生成计划。重复应用已完成计划不会再改文件。文字 `fix` 建议不会作为 shell 执行，也不会自动安装依赖或修改 release workflow。

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

第三方依赖声明可用 `repo deps check` 检查，使用 `repo deps plan` 生成显式只读计划，
审阅 JSON 后再执行 `repo deps apply`。协议、版本分组及恢复方式见[依赖版本一致性](./dependencies.md)。

```bash
repo upgrade
repo upgrade --yes
repo upgrade --overwrite
repo upgrade --no-overwrite
repo upgrade --core
repo upgrade -i
repo upgrade -s
repo upgrade --dry-run
repo upgrade --json > upgrade-plan.json
repo upgrade --markdown
repo upgrade --apply upgrade-plan.json
```

用途：

- 同步仓库标准资产与脚本。
- `--core` 只同步核心配置，跳过 GitHub 相关资产。
- `-i` 交互式选择。
- `--no-overwrite` / `-s` 保留已有 drifted 文件。
- `--yes` / `--overwrite` 非交互覆盖 drifted 标准资产。

`--dry-run`、`--json` 和 `--markdown` 始终只读预览，不写入或弹出交互选择。每个选中资产都有 `add`、`modify`、`delete`、`identical`、`skip` 或 `conflict` 状态及原因。package 脚本与依赖、workspace 设置、AGENTS 章节、gitignore 规则、工具引用和旧版本迁移都进入同一计划。文本和 Markdown 提供逐文件 unified diff；二进制文件、前后内容合计超过 256 KiB 的文本会明确标注，不伪造 diff。

`--apply` 使用已审核 JSON 中的精确内容，应用全部可执行条目。普通升级仍支持交互选择覆盖；非交互且没有 `--yes` 时仅写入已批准的新增文件。所有选择都在首次写入前完成。`--no-overwrite` 和 `-s` 也保护旧版迁移元数据；自定义发布工作流需要显式 `--overwrite-release`，既有 LICENSE 始终保留。预发布 lane 迁移与元数据删除属于不可拆分的选择组；无法识别的预发布状态保留在磁盘上，等待手动迁移。

计划记录目标、资产和本地配置文件的原始 hash。应用在首次替换前核对全部输入，拒绝并发修改或 workspace 包集合变化；完整应用过的计划再次执行不会写入。替换前会创建 `.repoctl-upgrade-*.bak` 原始备份，失败后回滚。如果并发编辑阻止安全回滚，错误会列出保留的原始备份。进程中断后，应核查备份、按需恢复原文件、移除残留 `.tmp` 文件，再生成新计划。无关文件及 Git refs/index 不会被修改。

每次预览都会在内存中重新加载配置入口、继承配置和可静态解析的本地导入，包括使用字符串字面量的动态导入。这些文件也纳入输入校验，模块相对路径保持原有含义。已安装的外部包、计算生成的导入路径、环境变量及任意文件/网络读取不在此模块集合中；这些运行时输入变化后应重新生成计划。可执行配置本身也应避免副作用，才能保持预览只读。

预览不会生成缺失的模板资产。出现 `assets-not-prepared` 时先修复包安装；源码贡献者可以显式运行 `pnpm --filter @icebreakers/monorepo-templates sync:assets`。计划绑定当前工作目录、输出目录和已安装资产的位置。公共 API 为 `planUpgrade(options)`、`formatUpgradePlan(plan, 'text' | 'markdown')`、`applyUpgradePlan(cwd, plan, { files? })` 和 `upgradeMonorepo({ dryRun: true })`；`UpgradePlan` 用 base64 保存精确应用内容。`repo workspace upgrade` 与 `repo ws up` 共用这些选项。

## 工作区依赖查询

```bash
repo workspace graph
repo workspace graph --json --redact
repo workspace graph --mermaid
repo workspace graph --package @acme/shared --type dependencies
repo workspace why @acme/web @acme/shared --json
repo workspace impact @acme/shared --direct --json
```

三个命令共用清单级依赖图，全部只读。默认包含 private 应用；`--exclude-private` 排除私有包，`--include-root` 加入根包。边的方向是消费者指向依赖。`--type` 可重复指定 `dependencies`、`devDependencies`、`peerDependencies`、`optionalDependencies`；不指定时包含全部四种关系。

`graph --package <包名或目录>` 显示选中包及其直接入边、出边，可重复选择多个包。`why <from> <to>` 返回从消费者到目标包的一条确定性最短依赖路径，包含两端；没有路径仍是成功查询，JSON 中 `found` 为 `false`。`impact <package>` 返回直接与传递消费者、最小距离及每个消费者的一条路径；`--direct` 只返回直接消费者。查询能处理循环依赖，impact 不把目标自身列为消费者。

选择器接受精确包名或 workspace 相对目录，例如 `./packages/shared`。重复包名会产生诊断；使用有歧义的名称查询会失败，需用显式目录消除歧义。未命名包也可按目录查询。强制本地引用若缺失、歧义、格式无效或版本不兼容，会进入 `diagnostics`，不会猜测依赖边。

解析支持 workspace 版本范围、workspace 别名（如 `workspace:@acme/shared@^1`）、相对 workspace 路径及本地 `link:`/`file:` 目录。每条边记录 `resolution`：`workspace` 和 `local` 表示显式本地引用，`semver` 表示普通版本范围或 `npm:` 别名匹配到的本地候选。这反映清单关系，并不代表 lockfile 的实际安装结果；不解析 registry tag、catalog、远程 URL 或源码 import。catalog 引用以及存在同名本地候选但无法解析的协议会产生 `unresolved_specifier` 诊断。使用方应先检查诊断再判断图是否完整，后续 affected 校验可据此保守回退。排除 private/root 包后，指向它们的强制引用也可能无法解析。

JSON 使用 schema version `1`、目录节点 ID 和稳定排序，字段名及诊断代码不随 `--lang` 改变。Mermaid 与 JSON 共用节点和依赖边，并保留孤立包。查询只输出 stdout，可用 shell 重定向保存；`--json` 与 `--mermaid` 不能组合。

程序化调用可使用 `getWorkspaceGraph(cwd, options)`、`filterWorkspaceGraph(graph, options)`、`whyWorkspaceDependency(graph, from, to, options)` 和 `getWorkspaceImpact(graph, package, options)`。每次读取图时刷新发现缓存，查询函数使用公开图类型，不泄漏 pnpm 内部类型。

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
