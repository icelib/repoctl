# @icebreakers/monorepo

[English](README.md) | 简体中文

repoctl 的 core engine 与程序化 API。

大多数用户应安装 [`repoctl`](https://www.npmjs.com/package/repoctl) 并使用 `repo` 命令。只有在需要底层 workspace、配置、诊断、发布或 tooling API 时，才需要直接安装本包。

```bash
pnpm add -D repoctl
pnpm exec repo doctor
```

```ts
import { getWorkspacePackageSummaries, runDoctor } from '@icebreakers/monorepo'

const workspace = await getWorkspacePackageSummaries(process.cwd())
const report = await runDoctor(workspace.workspaceDir)
```

`getWorkspacePackages(root)` 默认排除根包，通过目录别名调用也一致。设置
`ignoreRootPackage: false` 可包含一次根包；私有包仍需设置
`ignorePrivatePackage: false`。`getWorkspaceData(cwd)` 的 `workspaceDir` 和
包路径使用物理路径，`cwd` 保留调用者的绝对路径，没有 workspace manifest 时
也保持一致。每次调用都会重新解析目录别名；长期运行的进程修改 workspace
manifest 或包目录后，应调用 `clearWorkspaceCache()` 再次扫描。

`verifyPrePush({ cwd, workspaces })` 接受相对于 `cwd` 的路径、物理绝对路径和
目录别名，按物理身份匹配并过滤该 `cwd` 之外的路径；省略 `workspaces` 时仍
自动发现 pnpm workspace。

hook 输入包含推送 ref 时，按剥离 tag 后的 commit 去重，在临时本地克隆中读取
该提交的 workspace、清单和脚本进行验证。存在依赖或安装生命周期脚本时，先在
克隆内执行 `pnpm install --frozen-lockfile`；无依赖的校验跳过安装。
失败或收到 SIGINT/SIGTERM 后，清理本次克隆再退出，原工作树和暂存区保持不变。
空输入及仅删除 ref 的推送仍在本地执行 lint/typecheck。

创建与初始化写入的 `repository.directory` 相对于物理 Git 根目录，兼容嵌套
workspace 和目录别名下尚未创建的目标。`initMetadata(cwd)` 在传入目录初始化，
README 保持写入该目录，链接相对于其物理位置；初始化嵌套目录会保留父 workspace
文件，已有 README 默认保留。
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

如果创建包的进程中断，`inspectCreateTarget(targetDir)` 会提供只读的归属状态，
`recoverCreateTarget(targetDir, { dryRun: true })` 可以预览安全清理。恢复只删除
仍与 staging 快照一致的文件，用户编辑、新增内容和未知状态会保留待检查。
确认目标中的生成文件可以全部清理，且工作区清单仍属于本次创建时，还会还原
创建前的清单。清单被用户修改或恢复记录无效时保留目标和 staging 证据；目标
有用户文件时也会保留其 workspace inclusion。可选的 `manifest` 结果使用导出的
`CreateManifestRecoveryResult` 类型，包含 `path`、`status` 和可选 `reason`。
状态为 `unchanged`、`would-restore`、`restored`、`preserved` 或 `unknown`；
旧版创建标记支持只清理目标目录，清单状态报告为 `unknown`。
同一恢复流程也可通过 CLI 执行：`repo recover <target>`（别名
`recover-create`），或使用 `repo new --recover <target>`、
`repo package create --recover <target>`。加上 `--dry-run` 可只预览；
`--json` 和 `--out <file>` 也会只预览并输出稳定的恢复结果。

升级与发布迁移复用相同的 pnpm 清单和 catalog 校验，保留已有隐式 `**` 发现及元数据值和类型（包括 `%YAML 1.1` 下的 `on` 和显式标记的整数）；校验失败、拒绝覆盖或保留自定义工作流时，旧发布配置和预发布状态也会保留。清单无变化时保留原文；有变化时使用格式化 YAML，并校验其值和类型与计划一致。

如果升级进程中断，`inspectUpgradeTransactions(cwd)` 会在不修改工作区的情况下
报告未完成的 journal。`inspectUpgradeLock(cwd)` 可以只读报告锁是缺失、活动、过期
还是损坏。两个 API 都不会自动清理；请先检查受影响文件，再处理 journal 或损坏的锁。

本包为已有安装保留 `repo` 和 `repoctl` bin。新用户文档统一推荐 `repoctl` 包。

## 项目链接

- 文档：https://repoctl.icebreaker.top
- 仓库：https://github.com/icelib/repoctl/tree/main/packages/monorepo
- 问题反馈：https://github.com/icelib/repoctl/issues
