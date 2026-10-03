# 配置文件

repoctl 推荐在仓库根目录使用一个配置文件：

```txt
repoctl.config.ts
```

`monorepo.config.ts` 已不再作为运行时配置入口。迁移旧仓库时请改名为 `repoctl.config.ts`。

repoctl 支持 `ts`、`mts`、`cts`、`js`、`mjs`、`cjs` 等配置文件后缀。新项目优先使用 `repoctl.config.ts`，这样能保留类型提示和更清晰的迁移路径。

## 最小配置

```ts
import { defineMonorepoConfig } from 'repoctl'

export default defineMonorepoConfig({
  commands: {
    create: {
      defaultTemplate: 'tsdown',
    },
  },
})
```

设置 `commands.create.defaultTemplate` 后：

```bash
repo new utils
```

会直接按默认模板创建，不再询问模板类型。

## 常用配置

```ts
import { defineMonorepoConfig } from 'repoctl'

export default defineMonorepoConfig({
  commands: {
    init: {
      preset: 'standard',
    },
    create: {
      defaultTemplate: 'tsdown',
    },
    clean: {
      autoConfirm: true,
    },
    upgrade: {
      skipOverwrite: true,
    },
  },
})
```

| 配置                              | 作用                                    |
| --------------------------------- | --------------------------------------- |
| `commands.init.preset`            | 控制初始化默认预设                      |
| `commands.create.defaultTemplate` | 控制 `repo new <name>` 的默认模板       |
| `commands.clean.autoConfirm`      | 不提示并选择所有符合条件的工作区包      |
| `commands.clean.dryRun`           | 预览删除及依赖变更，不写入文件          |
| `commands.upgrade.skipOverwrite`  | 同步标准资产时是否保留已有 drifted 文件 |

## 查看当前配置

```bash
repo config inspect
repo cfg i --json --out reports/config.json
repo cfg i --markdown --redact --out reports/config.md
repo config validate --json
repo config inspect --command ai --set 'format="json"' --set 'force=false' --json
```

配置加载会在 CLI 执行，以及读取配置的 API 写入文件之前检查 repoctl 自有字段。未知字段、错误类型、非法枚举和冲突的覆盖策略会返回稳定规则 ID 与字段路径；可选字段请省略，不要填 `null`。ESLint、Stylelint、Commitlint、Vitest 原生透传、插件函数和 lint-staged 回调保留原有扩展边界，C12 配置工厂、继承配置和环境层继续可用。

`config validate` 只读检查，失败退出码为 1。JSON 包含 `schemaVersion`、`valid`、`file` 和 `diagnostics`，诊断字段为 `id`、`path`、`actualType`、`expected`、`suggestion`。加载失败使用 `config.load-failed`，不输出配置代码抛出的任意内容。配置文件仍是受信任的 JavaScript，加载时会求值；本命令不会隔离配置代码自身的行为。

`inspect --command` 支持 `ai`、`clean`、`create`、`deps`、`init`、`mirror`、`release`、`upgrade`，与命令执行复用同一个选项解析器。新增 `effective.values` 与逐字段 `effective.origins`，来源固定为 `default`、`project`、`cli`。重复传入 `--set 字段路径=JSON` 可只读预览配置覆盖；数组整体替换，显式 `false` 和空数组会保留。此处解释命令配置，实际发现的文件、选中的包和 `--all` 等运行参数请查看对应命令计划。

配置 CLI 报告默认隐藏环境变量映射、脚本内容、工具原生配置及敏感键；`--redact` 额外替换 cwd、配置目录和 home 路径。程序化报告使用 `explainMonorepoConfig`、`validateConfigFile`。`loadMonorepoConfigDetails` 与原有 `inspectMonorepoConfig` 为需要回调的代码保留运行时对象，请勿直接序列化这些原始对象作为排障报告。

旧版生成配置中的 `tooling.lintStaged.monorepoCommand` 应改为 `tooling.lintStaged.repoCommand`；旧字段此前被忽略，现在会明确报错。

## 配置的定位

配置文件只负责团队默认值，不建议把一次性命令参数都写进去。

推荐做法：

- 团队长期一致的选择写进 `repoctl.config.ts`。
- 临时行为用命令参数表达，例如 `--dry-run`、`--json`、`--out`。
- 自动化脚本优先使用显式参数，减少隐藏状态。

## 继续阅读

- [执行模型](./execution-model.md)
- [模板与创建](./templates.md)
- [模板资产治理](./template-assets.md)
- [报告与自动化输出](/zh/tasks/reports)

## 清理工作区包

先运行 `repo workspace clean --dry-run` 选择并预览；非交互场景可用
`repo workspace clean --yes --dry-run` 预览全部符合条件的包。
去掉 `--dry-run` 才会执行。交互初始不勾选任何包，空选或取消完全不写入。
`--yes` 遵循 `ignorePackages` 和 `includePrivate`，不扩大到仓库文档、
`.qoder` 或用户的全局 skills。
即使从子包目录调用，也会读取工作区根目录的配置。

预览 JSON 的 `deletions` 列出删除目录，`metadata` 列出根 `package.json`
的依赖字段前后值。只有非空选择才会迁移旧的
`devDependencies.@icebreakers/monorepo` 并确保 `devDependencies.repoctl`；
默认保留已有 repoctl 版本，缺失时填入 `latest`，可通过
`--pinned-version` 显式指定。无需修复时不重写 package.json。

工作区之外的目录、符号链接目标或父路径、链接的根 package.json，以及
会连带删除未选嵌套包的目标会在写入前被拒绝。此命令不修改消费者的依赖声明。

`init` 检查上下文对应顶层 CLI，默认预设为 `standard`，项目配置和显式 CLI 选项依次覆盖默认值。公开 `init()` API 与 `workspace init` 保留仅初始化元数据的默认行为。来源路径中，动态键名内的点与反斜杠使用反斜杠转义。需要加载 repoctl 配置的命令会在执行前校验所有自有配置块，包括与当前命令无关的配置。

## `commands.doctor`

Doctor 先校验整份配置的 schema，再只执行选中的规则。未选策略即使存在违规，也不产生检查结果，但结构错误的配置始终会被拒绝。省略 `rules` 表示运行全部规则，`rules: []` 表示不运行任何规则。从包目录执行时，`config inspect --command doctor` 与 doctor 都使用工作区根配置，显式 CLI 规则选择优先于项目配置。

在 `commands.doctor.suppressions` 配置有理由的抑制。每项必须提供 `id` 与非空 `reason`，可选 `path` 精确匹配 workspace 相对文件路径。可选 `expires` 使用 UTC 日期 `YYYY-MM-DD`，到期当天仍有效。JSON 保留原始发现的状态、`suppression`、`rawSummary`，以及全部抑制记录及命中数量。仅有效抑制从 `summary` 和 strict 退出码中排除；过期与未命中的记录仍会展示。

```ts
export default defineMonorepoConfig({
  commands: {
    doctor: {
      rules: ['root-scripts', 'commit-hooks'],
      suppressions: [{
        id: 'commit-hooks',
        reason: 'CI validates commits while the hooks migration is scheduled',
        expires: '2026-12-31',
      }],
    },
  },
})
```

## TypeScript project references

无需启用写入，即可检查现有引用图：

```bash
repo tooling references check --json
repo tooling references plan > references-plan.json
repo tooling references sync --dry-run
repo tooling references apply references-plan.json
repo tooling references sync
```

发现诊断或待同步差异时，`check` 返回退出码 1。所有命令输出带版本的 JSON。`check`、`plan`、`sync --dry-run` 不写文件；`apply` 和 `sync` 要求显式启用：

```ts
export default defineMonorepoConfig({
  tooling: {
    projectReferences: {
      enabled: true,
      root: 'tsconfig.json',
      projects: ['packages/*/tsconfig.json', 'apps/*/tsconfig.build.json'],
      exclude: ['packages/legacy/tsconfig.json'],
      relations: [
        { source: 'packages/app/tsconfig.json', target: 'packages/shared/tsconfig.json' },
      ],
    },
  },
})
```

根聚合配置和目标 tsconfig 必须已存在。不填 `projects` 时，发现实际 pnpm workspace 包（含 private 包）下的 `tsconfig.json`；没有 TS 配置的包会跳过。模式以 workspace 为基准，可选择同一包的多个配置。`exclude` 只排除受管发现，不删除已有手工引用。workspace 包以外的配置不自动入选，也不会把 repoctl 源仓库的引用清单复制给用户项目。

根配置聚合选中的工程；只有显式 `relations` 才会添加工程之间的编译关系，npm 依赖不会自动变为 TS 引用。目标 workspace 需要安装 TypeScript，命令使用该编译器读取继承配置，在写入前检查缺失目标、循环、`composite`、声明输出与 `noEmit` 兼容性。不会强制启用 composite、修改编译选项、创建 tsconfig 或替换脚本。计划提供验证命令，优先保留包原有的 `typecheck`（包括 `vue-tsc`）入口；同步后运行这些命令验证真实源码。计划阶段检查配置，不代替完整源码编译。

已有引用归用户维护。只有本功能新增的条目会记入 `.repoctl/typescript-references.json`，请将该文件与 tsconfig 一起提交。删除或排除项目只移除登记过的引用。用户编辑或移除受管条目会阻止同步：可以恢复条目，或明确删除登记记录，将该条目重新交给用户管理。保留 `references` 以外的 JSONC 字节、BOM 和换行风格，根引用与显式关系使用稳定的相对配置文件路径。

保存的计划包含输入指纹和精确 diff。过期或被修改的计划在写入前失败；重复应用已完成的计划不产生变化。`.repoctl/typescript-references.lock` 进程锁覆盖重新校验、写入、验证、回滚和清理。多文件变更先准备备份，再统一替换并验证，失败会回滚。若并发编辑阻止安全回滚，错误会列出保留的恢复文件：保留这些文件，合并业务修改与原始备份，一致恢复归属登记后重新生成计划。进程被终止也可能留下 `.repoctl-references-*.bak`/`.tmp`；确认没有写入进程，恢复对应备份与归属登记后，再移除遗留锁；不会自动覆盖并发编辑。
