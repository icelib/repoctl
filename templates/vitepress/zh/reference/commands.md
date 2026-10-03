# 命令速查

[`repo workspace remove`](./removal.md) 可按准确包名或目录预览移除单个包，检查消费者与待人工复核引用，再显式应用已审查的 JSON 计划。预览不删除文件；消费者默认阻止移除，只有明确指定 `--remove-references` 才计划删除对应清单依赖字段。

[`repo workspace prepare`](./artifacts.md) 可预览原生 Turbo prune 构建上下文或锁定 pnpm deploy 生产目录，再显式应用已审查的 JSON 计划。必须选择唯一包和工作区外的空输出目录。

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

`--rules` 在执行前选择精确、稳定的检查 ID；未知 ID 会失败并列出可用规则。CLI 会替换 `commands.doctor.rules`；省略规则时执行全部检查，配置中显式空数组表示不执行检查。共享的文件发现和规则前置读取仍会执行。`manifest-health` 是静态清单检查的汇总规则。架构边界与第三方依赖准入同样使用稳定的 `boundary-*` / `admission-*` ID；单选 `boundary-policy` 或 `admission-policy` 时汇总仍保留实际失败状态，必要的配置失败不会被过滤。自定义策略名只出现在诊断详情中。

在 `commands.doctor.suppressions` 配置有理由的抑制。每项必须提供 `id` 与非空 `reason`，可选 `path` 精确匹配 workspace 相对文件路径。可选 `expires` 使用 UTC 日期 `YYYY-MM-DD`，到期当天仍有效。JSON 保留原始发现的状态、`suppression`、`rawSummary`，以及全部抑制记录及命中数量。仅有效抑制从 `summary` 和 strict 退出码中排除；过期与未命中的记录仍会展示。

`--fix` 仅输出 JSON 预览，不修改项目文件。首批修复器只补根 `package.json` 中缺失的 `repo:init`、`repo:new`、`repo:check`、`repo:doctor` 键。已有值（包括空值和自定义脚本）保留，由用户人工核查。未选择或有效抑制的规则不会生成修复。审核新增脚本、完整前后内容、哈希、风险与 diff 后，用 `--apply` 应用。计划包含原始清单内容，不支持脱敏或 Markdown 转换后执行。

应用时复核规范化 workspace 与原始文件内容，拒绝链接文件和篡改的操作，复用暂存写入及回滚事务，再无抑制地运行根脚本检查。输入内容改变会停止修复，需要重新生成计划。重复应用已完成计划不会再改文件。文字 `fix` 建议不会作为 shell 执行，也不会自动安装依赖或修改 release workflow。

## `repo env check`

```bash
repo env check
repo env check build test --json --strict
repo env check --markdown --no-framework-inference
```

只读检查静态 `process.env.NAME`、`import.meta.env.NAME`、字面量属性访问与解构，并与 Turbo 环境声明对照。默认检查 `build`，包含 private 包。每个包和任务分别列出参与 hash、仅透传、框架推断、框架内置、遗漏声明及无法静态确定的访问，附源码位置。注释和普通字符串不计为引用。真实 `.env*`、`.dev.vars*` 只检查文件路径，从不读取内容；示例文件只提取键名。JSON、文本和 Markdown 不输出变量值或源码片段。

支持根与包级 `turbo.json`/`turbo.jsonc`、包专属任务、按顺序继承其他包配置、数组替换、`$TURBO_EXTENDS$` 和任务继承排除。变量通配符和否定模式采用 Turbo 语义。不支持的高级 `global` 配置及对象形式输入会返回配置失败，避免猜测覆盖结果。环境文件同时核对 `globalDependencies`、任务 `inputs`、`$TURBO_ROOT$`、显式排除和 Git 默认未忽略路径；文件存在本身不表示缓存已覆盖。`passThroughEnv` 只提供运行时变量，不把值计入 hash，报告会要求复核，不会自动提升为 `globalEnv`。全局 `*` 声明会提示检查缓存失效范围。

在 `repoctl.config` 的 `commands.env` 中配置 `tasks`、包相对路径的 `include`/`exclude` glob、`frameworkInference` 和 `suppressions`。每条豁免必须有稳定 `rule` 与非空 `reason`，可按 `package`、`task`、`variable` 和仓库相对 `path` glob 缩小范围。豁免诊断仍可见，未匹配豁免会产生警告。配置失败退出 1；`--strict` 同时阻断警告。`--dry-run` 表明命令始终只读。API 为 `checkEnvironmentCache(cwd, options)` 和 `formatEnvironmentCache(report, markdown?)`。

静态引用只是所选任务的候选输入，不能证明脚本实际执行了该源码。扫描覆盖 JS/TS 与 Vue/Svelte script block，跳过链接和大于 2 MiB 的文件；不解析别名、被遮蔽的全局变量、模板表达式、生成代码或跨包源码导入。框架推断依据包依赖估算，运行参数、自定义前缀及 shell 脚本引入的变量需要人工复核。既有可执行 repoctl 配置本身也应避免副作用。命令不运行任务、不加载真实环境值、不重写 Turbo 配置，也不扩大全局缓存输入。

参考：[Turbo 环境变量](https://turborepo.com/docs/crafting-your-repository/using-environment-variables)、[配置](https://turborepo.com/docs/reference/configuration)、[包配置继承](https://turborepo.com/docs/reference/package-configurations)。

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

## `repo package check`

```bash
repo package check
repo package check --filter '@scope/*' --strict
repo package check --filter my-library --keep-temp --json
```

按依赖顺序构建选中的 workspace 包及其依赖，再使用 publint 0.3.25 和 ATTW 0.18.5 校验实际 `pnpm pack` tarball。构建失败后不再打包。本地开发依赖也纳入构建，private 构建依赖可以只构建、不打包或校验。private 包默认明确标记为跳过，传入 `--include-private` 可包含它们。可重复 `--filter` 合并 pnpm 选择器；`--build-script` 可替换默认 `build` 脚本，没有该脚本的包按已经准备好的发布文件处理。

临时消费者独立安装 tarball 和本地运行时依赖的 tarball，执行包声明支持的 Node ESM/CJS 入口及 TypeScript NodeNext 消费检查。类型消费使用 ATTW 固定的 TypeScript 5.6.1-rc。未声明支持的模块格式不强制通过；仅供浏览器使用的入口及非 JavaScript 资源接受清单/类型分析，不执行 Node import；JavaScript bin 做语法检查，不调用应用命令。安装可能访问 registry，依赖安装脚本默认禁用；workspace 构建与 pack 生命周期脚本正常执行。

JSON 包含每个包的文件清单、稳定的诊断来源/代码、上游原始细节及子进程参数数组。`--strict` 将 warning 视为失败。`--keep-temp` 保留 tarball、消费者清单和命令工作目录，方便复现；未启用时，失败后也会清理临时文件。命令不会发布包、修改版本或写入发布状态。

接入发布门禁时，可以添加 `"package:check": "repoctl package check --strict"` 脚本，再把 `package:check` 加入 `commands.release.hooks.verify`。不要从 build/prepack 脚本调用本命令，以免循环执行。

## `repo check`

需要显式启用闲置代码及依赖分析时，参阅 [`repo check knip`](./knip.md)。

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

`--apply` 使用已审核 JSON 中的精确内容，应用全部可执行条目。普通升级仍支持交互选择语义迁移；具有历史上游基线的安全合并和已批准的新增文件可以非交互执行。所有选择都在首次写入前完成。`--no-overwrite` 和 `-s` 也保护旧版迁移元数据；自定义发布工作流需要显式 `--overwrite-release`，既有 LICENSE 始终保留。预发布 lane 迁移与元数据删除属于不可拆分的选择组；无法识别的预发布状态保留在磁盘上，等待手动迁移。

根受管资产采用三方合并：比较上次上游内容、当前本地文件和新安装模板。互不重叠的修改自动合并；同一区域的修改在计划中提供旧基线、本地、上游片段及行号。二进制文件的双边修改，以及合计超过 1 MiB 的文本，需要手动处理冲突。package/workspace 配置、AGENTS、gitignore 继续使用现有语义合并策略。本能力不升级生成的 app/package 业务目录，也不执行历史模板代码。

基线保存在 `.repoctl/baselines/root/<路径 SHA-256>.json`；应将此目录提交到仓库，让不同克隆共享升级历史。每条记录包含资产路径、模板包和版本、源文件 SHA-256，以及上游原文和哈希，不把定制后的合并结果当作上游。哈希用于内容完整性和本地来源追溯，并非发布者签名。保存的计划本身就是待审核的写入内容；修改内容并重算哈希后，需要重新审核，哈希不能证明其作者身份。没有历史基线且内容不同的旧文件标为 `baseline-missing` 冲突；审核后可使用 `--overwrite` 显式采用新模板，`--yes` 本身不能消除冲突。与上游完全相同的文件可以只登记基线，不重写资产。删除基线目录会丢失历史信息，下一次升级重新采用保守的首次处理规则。

用户已删除的受管文件不会恢复，即使传入 `--overwrite` 也一样；需要手动恢复后才能继续升级。上游删除文件时，仅自动删除本地没有定制的版本，定制版本保留并报告冲突。每个选中文件与其已审核基线操作属于同一事务，统一回滚和检查重试。JSON 文件条目的可选 `baseline` 包含前后哈希和精确内容；部分选择不会推进其他文件的基线。旧版保存计划没有此字段时，不会额外创建未审核的记录。冲突文件不被应用；仍有冲突时 CLI 预览和应用均返回退出码 1，即使其他选中文件成功应用，API 结果仍通过 `conflicts` 列出待处理路径。

计划记录目标、资产和本地配置文件的原始 hash。应用持有 `.repoctl/upgrade.lock`，直到输入校验、重复应用判断、写入、回滚和清理全部完成。它拒绝并发写入或 workspace 包集合变化；完整应用过的计划再次执行不会写入。替换前会创建 `.repoctl-upgrade-*.bak` 原始备份，失败后回滚。恢复文件和本次创建的目录只有在文件系统身份仍属于当前事务时才会清理；撞名文件、被改写的恢复内容和被替换的目录均予以保留。如果并发编辑阻止安全回滚，错误会列出保留的原始备份。进程中断后，先确认没有活动写入者，核查备份与临时文件并按需恢复原文件，然后移除锁并重新生成计划。无关文件及 Git refs/index 不会被修改。

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

Doctor 修复在输入校验、应用、验证、回滚和清理期间持有 `.repoctl/doctor-fix.lock`，防止并发写入使成功修复被另一事务回退。进程异常退出后，先确认没有活动写入者并处理保留备份，再手动移除锁。

## `repo tooling references`

`check --json` 无需启用即可检查已有引用；`plan` 和 `sync --dry-run` 只读输出稳定 JSON。显式配置 `tooling.projectReferences.enabled: true` 后，使用 `sync` 或 `apply <plan.json>` 同步受管引用。保留手工引用及 TypeScript/Vue 原有验证入口；不兼容编译选项、循环、缺失目标和过期计划会阻止应用。[配置参考](./config#typescript-project-references)说明了发现规则、显式编译关系、归属和恢复方式。

### 增量接入 Playwright

为已有 Vue/React Vite 应用添加浏览器测试；应用需包含 `build` 和 `preview` 脚本：

```sh
repo tooling capability list --json
repo tooling capability plan playwright --target web --route / --role button --name Increment --expect-text 'Count: 1' --json > e2e-plan.json
repo tooling capability apply e2e-plan.json --json
pnpm install
pnpm --filter @repoctl-e2e/web test:e2e:install
pnpm test:e2e
```

使用 `--test-id` 可替代 `--role`/`--name`。路由、点击目标和预期文本必须对应应用中的真实交互。计划展示文件 diff、依赖、脚本、冲突和后续操作，预览不安装依赖。应用时使用已审阅的内容，检查过期输入和文件冲突；写入失败会回滚，重复应用不产生额外修改。首次接入请选择空目录（可用 `--directory` 指定）。应用业务文件及与生成内容不同的文件均受保护。

能力包生成独立 E2E 工作区、无头 Chromium 测试、Turbo 构建依赖、CI 工作流、HTML 报告及失败 trace。浏览器需显式安装。`--port` 与 `--ci-port` 分别指定本地和 CI 端口且不能相同；CI 始终启动独立服务。本地只有显式添加 `--reuse-existing-server` 才复用服务。Playwright 在成功、失败和中断后清理自己启动的服务，保留借用的服务。安装后需提交 lockfile。

公开 API：`listToolingCapabilities()`、`planToolingCapability(cwd, options)`、`applyToolingCapability(plan)`。JSON 使用 schemaVersion 1，字段名不随 CLI 语言变化。
