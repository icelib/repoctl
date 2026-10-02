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
```

`--redact` 适合把报告发到 issue、PR 或外部协作渠道。

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

## `commands.doctor`

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
