# repoctl

[English](README.md) | 简体中文

`repoctl` 是 repoctl CLI 的推荐安装包。包名为 `repoctl`，主要命令为 `repo`。

## 安装

```bash
pnpm add -D repoctl
```

## 接入已有工作区

```bash
pnpm exec repo init
pnpm exec repo doctor
pnpm exec repo templates
pnpm exec repo new my-package
pnpm exec repo check
```

生成后的工作区还会提供 `repo:init`、`repo:doctor`、`repo:new` 和 `repo:check` 等无冲突根脚本。

## 常用工作流

```bash
pnpm exec repo doctor --json
pnpm exec repo upgrade --dry-run
pnpm exec repo upgrade --json
pnpm exec repo upgrade --yes
pnpm exec repo new dashboard --template vue-hono --json
pnpm exec repo recover apps/dashboard --dry-run --json
pnpm exec repo recover apps/dashboard
pnpm exec repo check --dry-run
pnpm exec repo check --full
pnpm exec repo env support --json --redact --out reports/support.json
```

升级的 `--dry-run` 与 `--json` 均只预览，不写文件或弹出选择提示；`--json` 隐含 `--dry-run`。计划列出文件操作、原因、是否需要覆盖确认、迁移依赖和有界内容统计。需要文本差异时加 `--diff`；二进制或超大文件只输出字节数和哈希。默认保留自定义发布工作流，旧发布状态仅在关联迁移整组获准且应用成功后删除。

如果升级配置的 targets 或交互选择未包含必需的迁移文件，旧发布状态会保留，计划会报告 `migration-targets-not-selected`。完整迁移需包含 `package.json`、`pnpm-workspace.yaml` 和旧发布工作流；已经受管的发布工作流可以作为不修改的依赖。

升级与发布迁移复用相同的 pnpm 清单和 catalog 校验，保留已有隐式 `**` 发现及元数据值和类型（包括 `%YAML 1.1` 下的 `on` 和显式标记的整数）；校验失败、拒绝覆盖或保留自定义工作流时，旧发布配置和预发布状态也会保留。清单无变化时保留原文；有变化时使用格式化 YAML，并校验其值和类型与计划一致。

创建包时遵循 pnpm workspace 规则与排除项，失败时恢复本次修改；生成脚本使用随包交付的工具。pre-push 发现实际包，识别删除与重命名两侧路径；需要回退到逐包脚本时先按依赖顺序构建变更包的上游闭包，再按 build → lint → typecheck → tsd → test 执行，避免根任务与包任务重复运行。

hook 输入包含推送 ref 时，按剥离 tag 后的 commit 去重，在临时本地克隆中读取
该提交的 workspace、清单和脚本进行验证。存在依赖或安装生命周期脚本时，先在
克隆内执行 `pnpm install --frozen-lockfile`；无依赖的校验跳过安装。
失败或收到 SIGINT/SIGTERM 后，清理本次克隆再退出，原工作树和暂存区保持不变。
空输入及仅删除 ref 的推送仍在本地执行 lint/typecheck。

创建与初始化写入的 `repository.directory` 相对于物理 Git 根目录，兼容嵌套
workspace 和目录别名下尚未创建的目标。初始化的 README 保持写入调用目录，
链接相对于其物理位置。初始化嵌套目录会保留父 workspace 文件；已有 README
默认保留。
生成的 README 链接支持包路径中的空格、括号、`#`、`?` 和字面百分号；包名按
原文显示，包括 `_`、`*`、`~` 等 Markdown 标点。

初始化在写入前校验 workspace YAML 结构、`packages` 字符串数组和 glob。
清单缺失或空白（含仅注释）时创建 `apps/*`、`packages/*`、`examples/*`，
已有显式数组则追加缺失的默认规则；创建包遇到缺失或空白清单时只写入准确目标路径。
两者均保留 `null`、`{}` 或未声明 `packages` 的合法清单所采用的隐式 `**` 发现，
无需追加时保留原文。追加支持以别名作为 `packages` 的键或值，保留注释及其他字段
的值和类型，必要时展开引用以保持共享值不变。写入前按 pnpm 规则重读序列化结果，
并与完整的计划清单比较。

初始化、创建包和 doctor 按当前 pnpm 的 YAML core 规则解释 workspace 清单。
`%YAML 1.1` 不会启用旧式布尔值、八进制、时间戳或 `<<` 合并。
显式非 core 标签（包括 `!!merge`、`!!timestamp`）会在初始化或创建写入前被拒绝，
doctor 则报告状态为 `fail` 的 `workspace-manifest`。普通锚点、别名和注释仍受支持。

`catalog` 和 `catalogs` 还会复用 pnpm 的结构校验，在初始化或创建写入前拒绝
无效映射、非字符串条目及值为 null 的命名 catalog；doctor 同样报告
`workspace-manifest: fail`。pnpm 接受的顶层 `catalog: null`、`catalogs: null`、
空映射、普通别名和空字符串 specifier 仍然有效。

## 语言

默认输出英文。使用 `--lang zh-CN` 或 `REPOCTL_LANG=zh-CN` 切换为简体中文。

## 高级 API

`repoctl` 会重新导出 `@icebreakers/monorepo` 的程序化 API，工程配置 wrapper 位于 `repoctl/tooling`。

`getWorkspacePackages(root)` 默认排除根包，通过目录别名调用也一致。设置
`ignoreRootPackage: false` 可包含一次根包；私有包仍需设置
`ignorePrivatePackage: false`。`getWorkspaceData(cwd)` 的 `workspaceDir` 和
包路径使用物理路径，`cwd` 保留调用者的绝对路径，没有 workspace manifest 时
也保持一致。每次调用都会重新解析目录别名；长期运行的进程修改 workspace
manifest 或包目录后，应调用 `clearWorkspaceCache()` 再次扫描。

`verifyPrePush({ cwd, workspaces })` 接受相对于 `cwd` 的路径、物理绝对路径和
目录别名，按物理身份匹配并过滤该 `cwd` 之外的路径；省略 `workspaces` 时仍
自动发现 pnpm workspace。

`resolveUpgradePlan(opts: CliOpts): Promise<UpgradePlan>` 提供与 CLI 一致的只读升级预览：

```ts
import { resolveUpgradePlan } from 'repoctl'

const plan = await resolveUpgradePlan({ cwd: '.' })
```

如果升级进程中断，`inspectUpgradeTransactions(cwd)` 会读取待处理的事务
journal，且不会修改工作区。处于 `needs-review` 状态的 journal 会阻止下一次
升级，避免猜测并覆盖用户编辑；请先检查报告中的路径，确认目标文件安全后再
清理 journal。

`inspectUpgradeLock(cwd)` 可在不修改工作区的情况下读取升级锁状态：`missing`、
`active`、`stale` 或 `malformed`。后续升级会自动回收 `stale` 锁；活动锁和损坏锁
应先人工检查。

如果创建包的进程在写入目标目录后被中断，`inspectCreateTarget(targetDir)` 会
报告 ownership marker 是缺失、活动、过期还是损坏。可以先用
`recoverCreateTarget(targetDir, { dryRun: true })` 预览，再显式执行恢复。
恢复只删除仍与 staging 快照一致的文件。目标不含用户文件时，如果清单仍能确认
属于本次创建，还会还原原有 `pnpm-workspace.yaml`，或删除本次新建的清单。
用户编辑或替换了清单、恢复记录缺失或损坏、staging 目录未知时，都会保留恢复
证据供检查。目标含有用户文件时，会保留其 workspace inclusion。
CLI 也提供相同流程：`repo recover <target>`（别名 `recover-create`）、
`repo new --recover <target>` 和 `repo package create --recover <target>`。
`--json` 与 `--out <file>` 会隐含只读预览，并返回稳定的 `status`、`removed`、
`preserved`、`targetRemoved` 和 `stagingRemoved` 字段。可选的 `manifest` 字段
使用导出的 `CreateManifestRecoveryResult` 类型，包含 `path`、`status` 和可选
`reason`；稳定状态为 `unchanged`、`would-restore`、`restored`、`preserved` 和
`unknown`。旧版创建标记仍支持只清理目标目录，清单状态报告为 `unknown`。

导出的 `UpgradePlan` 结构如下，文件路径与 `dependsOn` 条目均相对于 `targetDir`：

```ts
interface UpgradePlan {
  cwd: string
  targetDir: string
  files: {
    path: string
    action: 'create' | 'update' | 'delete' | 'skip'
    reason: string
    requiresConfirmation: boolean
    dependsOn: string[]
    diff?: {
      kind: 'text' | 'binary'
      beforeBytes: number
      afterBytes: number
      beforeHash: string | null
      afterHash: string | null
      addedLines: number
      deletedLines: number
      truncated: boolean
      text?: string
    }
  }[]
}
```

## 项目链接

- 文档：https://repoctl.icebreaker.top
- 仓库：https://github.com/icelib/repoctl/tree/main/packages/repoctl
- 问题反馈：https://github.com/icelib/repoctl/issues
