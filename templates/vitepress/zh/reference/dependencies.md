---
title: 依赖版本一致性
description: 比较工作区依赖声明，并应用审阅后的修复计划。
---

# 依赖版本一致性

`repo deps check` 读取根目录和所有工作区清单，包含 private 包，按依赖名称、声明分区和配置的版本分组进行比较。它不查询 registry，也不自动选择最高版本。

```bash
pnpm exec repo deps check
pnpm exec repo deps check --json
pnpm exec repo deps plan typescript --section devDependencies --to '^5.7.0' --json > deps-plan.json
pnpm exec repo deps apply deps-plan.json
pnpm install --lockfile-only
pnpm install --frozen-lockfile
```

`deps fix` 是 `deps plan` 的别名。生成计划始终只读，不加 `--dry-run` 也不会修改文件；只有 `deps apply` 才会修改清单。先审阅 JSON，再应用；锁文件更新和安装依赖由单独、显式的 pnpm 步骤完成。

## 理解报告

| 状态           | 含义                                   |
| -------------- | -------------------------------------- |
| `consistent`   | 声明相同，来源和范围可确认。           |
| `equivalent`   | 文本不同，但允许的版本相同。           |
| `compatible`   | 不同范围存在共同允许的版本。           |
| `conflict`     | 没有任何版本同时满足所有声明。         |
| `uncomparable` | 协议、来源或范围无法可靠比较。         |
| `managed`      | workspace 引用由工作区和发布规则管理。 |
| `exception`    | 显式例外，并显示保留原因。             |

报告包含每条声明的清单路径、工作区目录、原始版本、依赖分区、协议和解析后的 semver 范围。出现等价文本差异、兼容范围差异或冲突时，检查以状态码 1 退出；例外及不可比较声明仍保留在报告中。JSON 字段名和状态值不随语言变化。

`dependencies`、`devDependencies`、`peerDependencies`、`optionalDependencies` 独立比较。npm alias 保留真实来源包，指向不同来源的 alias 不可比较。默认和命名 catalog 会解析后参与比较，但修复不替换 catalog 引用。workspace、file、link、URL、Git 及未知声明仅报告。数字预发布版本遵循 semver 的预发布匹配规则。

## 有意保留多个版本

在工作区根目录的 `repoctl.config.ts` 中配置分组；从子包执行命令时也读取此配置：

```ts
import { defineMonorepoConfig } from 'repoctl'

export default defineMonorepoConfig({
  commands: {
    deps: {
      groups: [
        {
          name: 'vue2-adapter',
          workspaces: ['packages/legacy-adapter'],
          dependencies: ['vue'],
          sections: ['dependencies', 'peerDependencies'],
          reason: '适配器仍需支持 Vue 2 消费者',
        },
        {
          name: 'canary',
          workspaces: ['examples/canary'],
          dependencies: ['vue'],
          reason: '验证上游新版本兼容性',
          ignore: true,
        },
      ],
    },
  },
})
```

`workspaces` 精确匹配相对目录，`.` 表示根目录，不使用包名模式。`dependencies` 精确匹配依赖名。省略 `sections` 表示选择所有分区，各分区仍独立比较。每组必须有唯一名称和非空原因；重叠匹配会报错，未匹配的声明归入 `default`。标记 `ignore` 的例外不能修复。用 `--group vue2-adapter` 选择其他分组。

## 应用与恢复

计划必须指定依赖名、分区和目标声明，只接受可比较的普通 semver 或来源、协议相同的 npm alias。目标必须与整组声明存在共同允许的版本。冲突、未知协议及例外会阻止计划生成；有意保留的版本应拆分成组，不兼容升级应作为单独变更审阅。工具不自动选择版本或跨主版本升级。

计划记录字段前后值、文件校验值，以及所有发现的清单、工作区设置和本地 repoctl 配置文件的校验值。应用时重新发现工作区并重新计算变更。输入被修改、新增包、篡改 diff、链接清单或部分已应用的计划都会在新增替换前被拒绝。计划绑定原工作区路径。

只替换计划中的清单，保留无关字段及其他依赖分区；重复应用同一计划不会再次写入。工具先准备替换内容与原始备份，写入失败会回滚已完成的替换。若并发修改导致无法安全回滚，错误中会列出保留的 `.repoctl-deps-*.bak` 备份。进程中断后，检查清单旁的这些备份，按需恢复原文，清除遗留 `.tmp` 文件，再重新生成计划。随后可用 doctor 和 pnpm 安装步骤验证工作区。

`repoctl` 导出 `checkDependencies(cwd)`、`planDependencyFix(cwd, options)`、`applyDependencyFixPlan(cwd, plan)`，以及对应的报告、配置和计划类型。

## Peer 兼容性

`repoctl deps peers --json` 比较每个工作区的 peer 承诺与显式 `devDependencies` 测试声明，包含 private 包和根包。必需 peer 没有测试声明时失败；optional peer 缺省时跳过，已声明测试版本时仍正常检查，不修改 pnpm 的自动安装或 strict-peer 策略。

报告区分 `declared_range`、`declared_version`、`lockfile_version` 和 `workspace_version` 证据。测试声明完全包含于 peer 范围时仅判定声明兼容；部分重叠保持 `unknown`，直到可靠的 pnpm 锁定版本或内部工作区版本提供明确结果。过期/不支持的锁文件及未知协议不会被当成通过。支持默认/命名 catalog、同源 npm alias、workspace 别名、预发布和复合范围；不把自动安装的 peer 当作显式测试声明。

JSON 包含稳定规则码、包和路径、peer 与测试声明、解析后的范围/版本、optional 状态及 workspace 中的 pnpm 策略值。单个测试或锁定版本不能证明全部支持范围；锁文件证据也不验证实际安装状态。检查不安装、不写文件，不替代现有发布 workspace 协议规则。失败返回非零；`--strict` 还会在 unknown 时失败。公开 API 为 `checkPeerDependencies(cwd)`。

## 第三方依赖准入

通过[依赖准入规则](./dependency-admission)按工作区允许或禁止第三方直接依赖，审核例外，并在 CI 中比较已审核基线。

## pnpm catalog 巡检与迁移

```bash
pnpm exec repo deps catalog check --json
pnpm exec repo deps catalog check --catalog legacy --json
pnpm exec repo deps catalog plan typescript --section devDependencies --json > catalog-plan.json
pnpm exec repo deps catalog plan react --section dependencies --group react18 --catalog react18 --to '^18.3.0' --json
pnpm exec repo deps catalog apply catalog-plan.json --json
pnpm install --lockfile-only
pnpm install --frozen-lockfile
```

`catalog check` 巡检所有默认与命名 catalog、根包及 private workspace 消费者、缺失 catalog/条目，以及未使用条目。`catalog:` 与 `catalog:default` 等价。默认 catalog 可以位于 `catalog` 或 `catalogs.default`，同时声明两者属于 pnpm 配置错误。`--catalog` 选择直接版本绕过和迁移候选所采用的策略；引用完整性始终检查所有 catalog。直接声明的 peer 范围和显式 ignore 版本组不计为绕过。

带版本结构的 JSON 包含精确清单路径、依赖分区、包名、原始声明、catalog 条目、消费者和稳定规则码。`missing_catalog`、`missing_entry`、`direct_declaration` 会令检查以状态码 1 退出。`unused_entry`、`uncomparable_entry` 是信息提示，未使用条目绝不会被自动删除。简单的 `overrides` 消费者（包括带版本的包选择器）会计入使用情况；嵌套 override 选择器明确报告 `unresolved_selector`，可能被引用的条目标记为 `usage_unknown`，不会误判为无人使用。

迁移复用 `commands.deps.groups` 的依赖一致性版本组，继续区分依赖分区。相同或 semver 等价的声明可以自动提出一个 catalog 条目。兼容但不同的范围会返回 `needs_target`，需要通过 `--to` 提供**每个已选声明的共同子范围**，避免扩大允许版本或引入主版本升级。不兼容版本需要显式分组后选择不同 named catalog，或保留原样。迁移不访问 registry，也不选择最新版本。

仅迁移普通 semver 范围和同源 npm alias；alias 的完整 `npm:source@range` 会保留在 catalog 中。workspace/file/link/Git/URL/tag 和未知声明保持原样。直接 `peerDependencies` 只报告，不能由此命令迁移。已有 catalog 引用保持原样；同一版本组混有其他 catalog 引用时需要明确分组。已有条目永不覆盖，即使显式 `--to` 与条目不同也会拒绝；应选择新 named catalog，或单独审阅影响全部消费者的条目变更。

`catalog plan` 无论是否传 `--dry-run` 都只读。JSON 包含 YAML 与消费者清单的完整 before/after 内容、文件哈希、所有已发现输入哈希和规范化选择。审阅联动差异后再执行 `catalog apply`。YAML 通过 AST 修改以保留无关配置和注释；待编辑 catalog 映射若通过 YAML anchor/alias 共享，会明确拒绝，避免改变其他 alias 消费者。默认和命名 catalog 的已有存放位置保持不变，锁文件仍由显式 pnpm 步骤更新。

应用绑定同一工作区和完整输入集合。过期 YAML、清单/策略变化、新增包、链接文件、部分应用及被篡改的计划内容都会在写入前被拒绝。YAML 与 JSON 复用依赖修复的暂存替换、原始备份和失败回滚。完整应用后的计划和重复迁移均无变化。如果回滚无法安全覆盖并发编辑，错误会列出保留的 `.repoctl-deps-*.bak` 原始备份；核对并恢复文件、清理残留临时文件，再生成新计划。并发编辑会保留。

公共 API 为 `checkCatalogs(cwd, options?)`、`planCatalogMigration(cwd, options)` 和 `applyCatalogMigrationPlan(cwd, plan)`。协议语义参见 [pnpm catalogs](https://pnpm.io/catalogs)，有意版本组策略可参考 [Syncpack](https://syncpack.dev/)。
