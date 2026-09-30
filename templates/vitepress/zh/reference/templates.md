# 模板与创建

repoctl 的模板由 `@icebreakers/monorepo-templates` 维护。CLI、脚手架和文档都复用同一份模板元数据。

更偏维护者视角的模板元数据、健康检查和自定义模板说明见：[模板资产治理](/zh/reference/template-assets)。

## 内置模板

| Key           | Category | 默认目录           | 适合场景                         |
| ------------- | -------- | ------------------ | -------------------------------- |
| `tsdown`      | library  | `packages/tsdown`  | TypeScript 库包                  |
| `vue-lib`     | library  | `packages/vue-lib` | Vue 3 组件库                     |
| `vue-hono`    | app      | `apps/client`      | Vue 3 + Hono 前后端一体应用      |
| `hono-server` | service  | `apps/server`      | Hono API 服务                    |
| `vitepress`   | docs     | `apps/website`     | VitePress 文档站                 |
| `nimbus`      | docs     | `apps/docs`        | Nimbus + Astro，默认中英双语文档 |
| `cli`         | tool     | `apps/cli`         | TypeScript 命令行工具            |

Nimbus 是新建文档站点（`Docs Site`）的默认模板，提供英文 `/`、中文 `/zh/`、搜索和 AI 文档入口。VitePress 仍可显式选择，两者分别生成到 `apps/docs` 和 `apps/website`，可以同时使用。通用创建命令仍默认使用 `tsdown`；项目名称 `docs` 不会隐式改变模板。非交互调用请显式指定 `--template nimbus`。

## 查看模板

```bash
repo templates
repo templates tsdown
repo templates --category library
repo templates --json
repo templates --markdown --out docs/templates.md
```

## 创建模板

```bash
repo new sdk --template tsdown
repo new ui --template vue-lib
repo new api --template hono-server
repo new docs --template nimbus
repo new website --template vitepress
repo new toolbox --template cli
```

普通名字会自动放到模板约定的目录里，例如库包进入 `packages/`，应用进入 `apps/`。如果你传入带 `/` 的路径，例如 `packages/shared-utils`，repoctl 会尊重这个路径。

## 按目标选择模板

### 要发布 npm 库

```bash
repo new sdk --template tsdown
```

生成后先检查：

- `package.json` 的 `name`、`exports`、`types`。
- `tsdown.config.ts` 是否符合产物格式。
- 是否需要补 `tsd` 类型测试。

### 要沉淀 Vue 组件

```bash
repo new ui --template vue-lib
```

生成后先检查：

- 组件入口是否只导出稳定 API。
- 样式是否能通过 Stylelint。
- 文档站或示例应用是否需要同步创建。

### 要创建应用或服务

```bash
repo new web --template vue-hono
repo new api --template hono-server
```

生成后先检查：

- 运行时环境变量和部署平台约束。
- `dev`、`build`、`typecheck` 脚本是否接入根任务。
- 是否需要在 CI 里加入 E2E 或集成测试。

### Cloudflare Worker 类型

`vue-hono` 和 `hono-server` 模板会在 `dev`、`build`、`typecheck` 前，根据已安装的 Wrangler 版本和 `wrangler.jsonc` 自动生成 `worker-configuration.d.ts`。该文件由 Git 忽略，也不会打入发布的模板包；依赖升级无需再提交重新生成的声明。

修改 binding 或兼容性配置后，可在应用工作区运行 `pnpm cf-typegen` 刷新编辑器类型。`pnpm cf-typegen:check` 保留为只读诊断命令，文件缺失或过期时会报错。构建和类型检查会自动重新生成，配置错误和真实 TypeScript 错误仍会阻止通过。

已有项目需同步这些脚本和 Turbo 的输入、输出配置，再执行 `git rm --cached worker-configuration.d.ts` 移除 Git 跟踪，并将文件加入 `.gitignore`。

### 要创建文档站

```bash
repo new docs --template nimbus
```

生成后先检查：

- 导航和 sidebar 是否围绕产品或包名组织。
- 是否需要中英文 locale。
- 是否需要把 `repo templates --markdown` 输出写进文档。

### 要创建 CLI

```bash
repo new toolbox --template cli
```

生成后先检查：

- `bin` 字段是否符合最终命令名。
- 参数解析、退出码和帮助信息是否可测试。
- 是否需要把命令用法写入 README。

## 创建前预览

```bash
repo new website --template vitepress --dry-run
repo new website --template vitepress --json
repo new website --template vitepress --json --out plans/website.json
```

`--dry-run` 不写入磁盘，只展示模板、源目录、目标目录、package name 和输出文件。

`--json` 输出同一份创建计划的结构化数据，隐含 `--dry-run`。

`--out <file>` 可以把文本或 JSON 预览写入文件，也隐含 `--dry-run`。

## 固化默认模板

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

之后：

```bash
repo new utils
```

会直接创建 `tsdown` 库包。

## 检查模板健康状态

```bash
repo templates --check
repo templates --check --json
```

模板检查会确认：

- 模板 source 和 target 没有重复。
- 每个模板 source 目录都存在。
- 每个模板根目录都有 `package.json`。
- 每个模板都有 category 和 description。
- 模板源目录里没有会被脚手架过滤掉的临时或生成文件。

## 继续阅读

- [接入已有 workspace](/zh/tasks/adopt-existing)
- [把校验加入 CI](/zh/tasks/ci)
- [配置文件](./config.md)
- [模板资产治理](/zh/reference/template-assets)
