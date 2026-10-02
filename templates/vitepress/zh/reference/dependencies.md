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
