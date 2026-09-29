# 模板与创建

repoctl 的模板由 `@icebreakers/monorepo-templates` 维护。CLI、脚手架和文档都复用同一份模板元数据。

更偏维护者视角的模板元数据、健康检查和自定义模板说明见：[模板资产治理](/zh/reference/template-assets)。

## 内置模板

| Key           | Category | 默认目录           | 适合场景                    |
| ------------- | -------- | ------------------ | --------------------------- |
| `tsdown`      | library  | `packages/tsdown`  | TypeScript 库包             |
| `vue-lib`     | library  | `packages/vue-lib` | Vue 3 组件库                |
| `vue-hono`    | app      | `apps/client`      | Vue 3 + Hono 前后端一体应用 |
| `hono-server` | service  | `apps/server`      | Hono API 服务               |
| `vitepress`   | docs     | `apps/website`     | VitePress 文档站            |
| `cli`         | tool     | `apps/cli`         | TypeScript 命令行工具       |

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

Cloudflare 模板要求 Node.js 22.18+，使用固定版本的 `cf` beta CLI 和 `cloudflare.config.ts`。Vue 模板采用 Cloudflare Vite 插件 v2 beta；Hono 与 VitePress 保留 Wrangler 作为 cf 内部使用的构建、开发实现。应用脚本直接使用 cf。

`vue-hono` 和 `hono-server` 在 `dev`、`build`、`typecheck` 前运行 `cf workers types`，生成 `.cloudflare/types/index.d.ts`。绑定类型从配置推导，运行时类型取决于兼容日期和标志。`.cloudflare` 由 Git 忽略，不会打入发布模板。

`pnpm cf-typegen` 生成声明；`pnpm cf-typegen:check` 在内存中比较预期声明，不创建或改写声明文件。文件缺失、过期、损坏或配置无效都会失败。由于 cf 暂无 `types --check`，适配脚本使用与 cf 一致的固定版本 `@cloudflare/config` 和 `@cloudflare/runtime-types`。绑定修改可以直接改变推导类型而不改变声明文本，绑定的使用正确性由 `typecheck` 验证。

已有项目请在分支内迁移：升级 Node，参考当前模板安装固定版本工具链，运行 `pnpm exec cf migrate` 并处理其后续提示。Vite 开发设置迁入 `vite.config.ts`；需要时将 Wrangler 实现设置保留在 `wrangler.config.ts`。同步对应模板的脚本、Worker tsconfig 类型路径及 Turbo 输入输出，并复制 `scripts/check-worker-types.mjs`。忽略 `.cloudflare`，移除被跟踪的 `worker-configuration.d.ts`，逐项核对配置后删除旧 Wrangler JSON/TOML 文件。构建、类型检查、声明检查、本地开发和部署 dry-run 全部通过后再切换 CI 命令。repoctl 不会自动迁移已有应用配置。

### 要创建文档站

```bash
repo new docs --template vitepress
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
