---
description: 说明 repoctl 内置模板、templateMap、模板健康检查、创建计划和模板资产维护方式。
---

# repoctl 模板资产治理

repoctl 的模板能力不只是复制目录。它会把模板元数据、默认生成目录、创建计划、健康检查和配置覆盖串起来。

## 1. 内置模板映射

| key           | source                | 默认 target        | 类型                  |
| ------------- | --------------------- | ------------------ | --------------------- |
| `tsdown`      | `templates/tsdown`    | `packages/tsdown`  | TypeScript library    |
| `vue-lib`     | `templates/vue-lib`   | `packages/vue-lib` | Vue component library |
| `hono-server` | `templates/server`    | `apps/server`      | Hono service          |
| `vue-hono`    | `templates/client`    | `apps/client`      | Vue + Hono app        |
| `vitepress`   | `templates/vitepress` | `apps/website`     | docs site             |
| `nimbus`      | `templates/nimbus`    | `apps/docs`        | default docs site     |
| `cli`         | `templates/cli`       | `apps/cli`         | command line tool     |

查看实际可用模板：

```bash
repo templates
repo templates --json
repo templates --markdown --out docs/templates.md
```

## 2. 创建计划

`repo new` 会先解析创建计划，再决定是否写入文件。计划包含：

| 字段                | 含义                                             |
| ------------------- | ------------------------------------------------ |
| `requestedTemplate` | 用户请求的模板 key                               |
| `template`          | 实际使用的模板 key                               |
| `sourceDir`         | 模板源目录                                       |
| `targetDir`         | 输出目录                                         |
| `targetExists`      | 目标目录是否已存在                               |
| `packageName`       | 写入 package.json 的包名                         |
| `renameJson`        | 是否把 `package.json` 输出为 `package.mock.json` |

预览创建：

```bash
repo new docs --template nimbus --dry-run
repo new docs --template nimbus --json --out plans/docs.json
```

`--json` 和 `--out` 都隐含 `--dry-run`，不会写入文件。

## 3. 模板选择和报错

显式传入 `--template` 时，repoctl 会先校验模板 key：

```bash
repo new sdk --template tsdown
```

如果模板 key 拼错，命令会失败并提示相近 key。它不会静默回退到默认模板，这样 CI 和脚本不会生成错误类型的项目。

## 4. 健康检查

模板资产可以通过 `repo templates --check` 检查：

```bash
repo templates --check
repo templates --check --json --out reports/templates.json
```

检查内容包括：

| 检查           | 目的                                 |
| -------------- | ------------------------------------ |
| source 唯一性  | 避免多个模板 key 指向同一源目录      |
| target 唯一性  | 避免多个模板默认写到同一目标目录     |
| source 目录    | 确认模板目录存在                     |
| package.json   | 确认模板根目录包含包元数据           |
| metadata       | 确认模板有 category 和 description   |
| filtered files | 避免把临时、缓存或生成文件放入模板源 |

## 5. 自定义模板

在 `commands.create.templateMap` 声明本地模板后，创建、交互选择、列表、详情和健康检查会使用同一份目录结果，包含 key、名称、说明、分类、源目录和默认目标。

```ts
import { fileURLToPath } from 'node:url'
import { defineMonorepoConfig } from 'repoctl'

export default defineMonorepoConfig({
  commands: {
    create: {
      templateMap: {
        'internal-service': {
          source: fileURLToPath(new URL('./templates/internal-service', import.meta.url)),
          target: 'apps/internal-service',
          label: 'Internal service',
          category: 'service',
          description: 'Company API service',
        },
      },
    },
  },
})
```

```bash
repo templates internal-service --json
repo templates --check --json
repo new payments --template internal-service --dry-run
```

绝对 `source` 路径可让内置模板和本地模板同时可用。相对 `source` 按 `templatesDir` 解析；默认根目录是已安装模板包。设置 `templatesDir: './templates'` 会替换所有模板（包括内置模板）的根目录，相对路径按配置文件所在目录解析。从 pnpm 子包目录运行时会查找工作区根配置，不会把模板路径移到子包内；生成目标仍按调用目录解析。

字符串映射保持兼容：`templateMap: { custom: 'custom' }` 等价于 `{ source: 'custom', target: 'custom' }`。对象定义可补充 `label`、`description`、`category`。非空 `choices` 数组继续控制交互顺序和可选范围，其名称与说明也会显示在列表和详情中；未配置时列出全部模板。内置创建意图的默认模板不变；登记自定义模板后交互会直接展示模板目录。

同名覆盖通过 `origin: 'custom'`、`overridesBuiltin: true` 及 `configFile` / `configPath` 显示。无效定义和重复交互 key 会定位到配置字段；`repo templates --check` 还会检查重复 source/target、失效目录和缺失 `package.json`。列表 JSON 仍为数组、详情 JSON 仍为对象，只增加目录字段；创建 JSON 的 `templateInfo` 携带所选模板的相同信息。

列表与健康检查只读取声明和文件，不生成项目，也不执行模板代码；显式 `--out` 才写出报告。程序调用可使用 `resolveTemplateCatalog({ cwd })` 和 `checkTemplates({ cwd })`。

## 6. 维护流程

更新模板时建议按下面流程验证：

```txt
修改 templates/<name>
  -> repo templates --check
  -> repo new demo --template <name> --json --out plans/demo.json
  -> 构建或测试生成后的 workspace
```

如果模板文件数量发生变化，维护模板快照的测试也需要同步更新。
