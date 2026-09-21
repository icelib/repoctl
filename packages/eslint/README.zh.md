# @icebreakers/eslint-config

## UnoCSS 包装层

`@icebreakers/eslint-config` 的 UnoCSS 能力仍然复用上游
`@antfu/eslint-config`，但现在额外提供了一层更贴近本仓库风格的包装 API。

推荐写法：

```ts
import path from 'node:path'
import { icebreaker } from '@icebreakers/eslint-config'

export default icebreaker({
  unocss: {
    strict: true,
    attributify: false,
    configPath: path.resolve(process.cwd(), './uno.config.ts'),
  },
})
```

行为说明：

- `unocss: true`：直接启用上游 Antfu 的 UnoCSS preset
- `unocss.configPath`：会被自动映射为 `settings.unocss.configPath`
- 不传 `configPath`：仍然按 UnoCSS 默认行为，从 lint 项目根目录查找 `uno.config.*`
- 同时传 `unocss.configPath` 和 `settings.unocss.configPath`：以前者为准
- 如果当前 workspace 没有安装 `@unocss/eslint-plugin`：该 preset 会自动跳过，不会直接抛错

## 简介

`@icebreakers/eslint-config` 基于 `@antfu/eslint-config` 的 flat config 预设，额外补充了 Tailwind CSS、MDX、Vue 无障碍以及 Icebreaker 团队常用的 TypeScript 默认规则。它返回一个 `FlatConfigComposer`，可以按需启用不同预设，并继续追加工作区特定的覆盖项。

## 环境要求

- Node.js 22 或更高版本
- 支持 Flat Config 的 ESLint 9
- React 核心插件已随当前包一起分发。Next.js、Query、无障碍、Astro、Svelte 等生态预设仍保持可选，缺失时会自动跳过对应配置，而不是在解析时直接报错。
- Wevu 兼容检查已内置，无需额外安装。如需启用 Tailwind、MDX、UnoCSS、Stylelint 桥、无障碍、Astro 或 Svelte，可安装对应的可选依赖：`eslint-plugin-tailwindcss` / `eslint-plugin-better-tailwindcss`、`eslint-plugin-mdx`、`@unocss/eslint-plugin`、`eslint-plugin-better-stylelint`、React 无障碍的 `eslint-plugin-jsx-a11y`、Vue 无障碍的 `eslint-plugin-vuejs-accessibility` 和它的 `globals` peer、Astro 的 `eslint-plugin-astro` 与 `astro-eslint-parser`，以及 Svelte 的 `eslint-plugin-svelte`、`svelte-eslint-parser` 和 `svelte`。XML / SVG 格式化需要 `@prettier/plugin-xml`；Astro 格式化需要 `prettier-plugin-astro`。

## 安装

```bash
pnpm add -D eslint @icebreakers/eslint-config
```

## 快速上手

在项目根目录创建 `eslint.config.ts`（或 `.mjs`）：

```ts
import { icebreaker } from '@icebreakers/eslint-config'

export default icebreaker()
```

使用包管理器运行 ESLint：

```bash
pnpm eslint "src/**/*.ts"
```

如果仍需兼容旧的 `.eslintrc` 流程，可改用 `icebreakerLegacy()`。

## 启用可选预设

所有可选项与 `@antfu/eslint-config` 保持一致，并叠加 Icebreaker 的调整：

```ts
import { icebreaker } from '@icebreakers/eslint-config'

export default icebreaker({
  vue: true, // 或 { vueVersion: 2 }
  react: true,
  query: true,
  typescript: true,
  test: true,
  tailwindcss: true,
  betterTailwindcss: {
    entryPoint: './src/tailwind.css',
    rules: 'recommended',
  },
  mdx: process.env.LINT_MDX === 'true',
  a11y: true,
  nestjs: true,
  ionic: true,
  miniProgram: true,
  formatters: true,
})
```

- `miniProgram`：启用小程序预设，注入全局变量、忽略常见产物/配置文件，在 `vue: true` 时补充小程序模板兼容调整，并加载内置的 `@weapp-vite/eslint` 兼容检查。
- `vue`：启用 Vue 规则，可根据 Vue 2/3 自动切换，并在 `ionic`、`miniProgram` 选项开启时追加对应覆盖。
- `react`：复用上游 React 预设；React 核心 lint 插件已内置在当前包里，配合 `a11y` 使用的 React 无障碍插件仍需按需安装。
- `query`：按需启用 TanStack Query 插件（`@tanstack/eslint-plugin-query`）及其推荐规则；缺少插件时按 no-op 处理。
- `tailwindcss`：传入 `true` 启用 `eslint-plugin-tailwindcss`。
- `betterTailwindcss`：传入 `true` 或 `{ entryPoint, tailwindConfig }` 启用 `eslint-plugin-better-tailwindcss`，用于 Tailwind v4 / v3 项目。对象模式默认只启用较快的语法检查（`no-duplicate-classes` 和 `no-unnecessary-whitespace`），并会把相对入口文件限制到对应源码目录；如需完整推荐规则，可设置 `rules: 'recommended'`。
- `mdx`：激活 `eslint-plugin-mdx` 处理 `.mdx` 文件。
- `astro`：启用上游 Astro 预设。需要安装 `eslint-plugin-astro` 和 `astro-eslint-parser`；缺少插件时按 no-op 处理。
- `svelte`：启用上游 Svelte 预设。需要安装 `eslint-plugin-svelte`、`svelte-eslint-parser` 和 `svelte`；缺少插件时按 no-op 处理。
- `stylelint`：把 Stylelint 诊断桥接到 ESLint，覆盖 `*.css`、`*.scss` 和 Vue `<style>` 块。需要安装 `eslint-plugin-better-stylelint`；缺少插件时按 no-op 处理。
- `a11y`：按需引入 JSX 与 Vue 的无障碍规则，缺少某一侧插件时只跳过对应框架配置。
- `typescript`：开启 TypeScript 预设，加强未使用诊断，可与 `nestjs` 搭配使用以获得 Nest 专属优化。
- `nestjs`：针对 NestJS 场景做 TypeScript 调整（允许带装饰器的空构造函数、依赖注入参数属性、声明合并等）。
- `formatters`：默认启用格式化辅助规则，其中也包括通过 `eslint-plugin-format` 处理 CSS / SCSS / Less。
- `test`：放宽 Vitest / Jest 常见规则，例如关闭 `test/prefer-lowercase-title`。
- `weapp`：`miniProgram` 的兼容别名，保留但不再推荐作为主入口。

### 格式化引擎

`@icebreakers/eslint-config` 仍然通过 `eslint-plugin-format` 承载样式类与文档类文件的格式化链路。
默认行为仍然与上游 Prettier 链路保持一致；如果你想在项目里做专项实验，
也可以继续手动把部分文件类型切到 `oxfmt`：

```ts
import { icebreaker } from '@icebreakers/eslint-config'

export default icebreaker({
  formatters: {
    css: 'oxfmt',
    html: 'oxfmt',
    markdown: 'oxfmt',
    graphql: 'oxfmt',
    oxfmtOptions: {
      lineWidth: 100,
    },
  },
})
```

支持范围：

- 默认值：CSS / SCSS / Less、HTML、GraphQL、Markdown 继续走上游 Prettier 链路。
  安装 `@prettier/plugin-xml` 后才会格式化 XML / SVG；安装 `prettier-plugin-astro`
  后才会格式化 Astro；存在 `@slidev/cli` 时才会走 Slidev
- `css: 'oxfmt'`：会同时切换 CSS / SCSS / Less
- `html: 'oxfmt'`：切换 HTML
- `markdown: 'oxfmt'`：切换 Markdown
- `graphql: 'oxfmt'`：切换 GraphQL

当前限制：

- 这不是一次完整的 `format/prettier -> format/oxfmt` 全量迁移
- `markdown: 'oxfmt'` 不能与 `formatters.slidev` 同时开启
- `oxfmtOptions` 会原样透传给 `format/oxfmt`

### 小程序预设

推荐在 `weapp-vite`、`wevu`、原生小程序模板里统一使用 `miniProgram: true`。
它会默认完成：

- 注入 `wx`、`Page`、`App`、`Component`、`getApp`、`getCurrentPages`、`requirePlugin`、`WechatMiniprogram` 全局变量
- 忽略 `dist/**`、`.weapp-vite/**`、`miniprogram_npm/**`、`node_modules/**`、`project.config.json`、`project.private.config.json`
- 当同时开启 `vue: true` 时，关闭 `vue/no-deprecated-slot-attribute`、`vue/no-useless-template-attributes` 与 `vue/singleline-html-element-content-newline`，允许小程序原生 slot 投影和编译器专用的 slot 属性；同时对命名为 `id`、`class` 或 `slot` 的 Vue props 给出 warning，因为小程序 `properties` 可能无法稳定接收到这些值
- 通过内置的 `@weapp-vite/eslint` 将不支持的 Vue、Pinia、Vue Router API 报告为 error，将存在语义差异的 API 报告为 warning，并将可追溯的 `RouterLink` 模板用法报告为 error

#### 原生小程序最小配置

```ts
import { icebreaker } from '@icebreakers/eslint-config'

export default icebreaker({
  miniProgram: true,
})
```

#### weapp-vite + wevu 最小配置

```ts
import { icebreaker } from '@icebreakers/eslint-config'

export default icebreaker({
  miniProgram: true,
  vue: true,
})
```

#### 与现有选项组合

```ts
import { icebreaker } from '@icebreakers/eslint-config'

export default icebreaker({
  miniProgram: true,
  vue: true,
  tailwindcss: true,
  ignores: ['coverage/**'],
})
```

`miniProgram` 会追加平台默认项和内置的 Wevu 兼容配置；你自己的 `ignores`、
`extends`、`rules` 以及额外 flat config 仍按原有方式继续组合，并可覆盖推荐的规则级别。

### Stylelint 桥接

Stylelint bridge 默认关闭，也不会随 `@icebreakers/eslint-config` 一起安装。
先安装 `eslint-plugin-better-stylelint`，再设置 `stylelint: true`。
启用后会默认使用 `@icebreakers/stylelint-config` 作为 Stylelint 预设，并把诊断桥接到 ESLint，用于：

- `*.css`
- `*.scss`
- `.vue` 文件里的 `<style>` 块

```bash
pnpm add -D eslint-plugin-better-stylelint
```

```ts
import { icebreaker } from '@icebreakers/eslint-config'

export default icebreaker({
  vue: true,
  stylelint: true,
})
```

也可以直接把 Stylelint 预设配置写进 `eslint.config.ts`：

```ts
import { icebreaker } from '@icebreakers/eslint-config'

export default icebreaker({
  vue: true,
  stylelint: {
    cwd: process.cwd(),
    presets: {
      order: false,
    },
    rules: {
      'color-named': 'never',
    },
  },
})
```

其中 `stylelint.cwd` 用来指定配置解析根目录，其余字段沿用
`@icebreakers/stylelint-config` 的选项结构，例如 `presets`、
`tailwindcssPreset`、`ignores`、`extends`、`overrides`、`rules`。

需要注意的是，这个 bridge 只负责把 Stylelint 诊断桥接到 ESLint，
并不等价于完整的 Stylelint 工作流。如果你需要独立的 Stylelint CLI、
编辑器内原生 Stylelint 集成，或单独执行 `stylelint --fix`，仍然建议在
接入方项目里额外安装 `stylelint` 和 `@icebreakers/stylelint-config`。

推荐给接入方使用的脚本约定：

```json
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "lint:styles": "stylelint \"src/**/*.{css,scss,vue}\"",
    "lint:styles:fix": "stylelint \"src/**/*.{css,scss,vue}\" --fix"
  }
}
```

如果你希望继续使用一条 `eslint --fix` 主链路，那么 `lint:fix` 默认也会
通过 `formatters` 处理 CSS / SCSS / Less。只有在项目需要完整 Stylelint
工具链时，再补充 `lint:styles` / `lint:styles:fix`。

### NestJS 项目

建议在 Nest 项目中同时开启 `typescript` 与 `nestjs`，以便应用以下定制：

- 允许常见的空装饰器类（如 `@Controller()`、`@Module()`）以及生命周期钩子占位实现。
- 放宽依赖注入常用的构造函数参数属性、 ambient 模块扩展等约束。
- 针对 `Function`、`any` 等在注入令牌或元数据中常见的类型用法做精确豁免，同时保留其他严格检查。

## 追加自定义配置

`icebreaker()` 返回的 composer 支持继续拼接 Flat Config：

```ts
import { icebreaker } from '@icebreakers/eslint-config'

export default icebreaker(
  { typescript: true },
  {
    files: ['*.vue'],
    rules: {
      'vue/no-undef-components': 'off',
    },
  },
)
```

亦可追加其它第三方或内部预设，统一合并。

## IDE 集成

- VS Code 安装 ESLint 扩展（版本需 ≥ 3.0.10）。
- 老版本 VS Code 需在设置中启用 `"eslint.experimental.useFlatConfig": true`。
- 默认可使用 `lint:fix` 作为 ESLint 主修复链路，其中包含 CSS / SCSS /
  Less 的格式化。只有在项目额外启用独立 Stylelint 工作流时，再运行
  `lint:styles:fix`。
- 如果你把部分文件类型切到 `oxfmt`，仍然继续使用同一条 `eslint --fix`
  链路，只是底层格式化引擎发生变化。

## 常见问题

- 如果提示缺少插件，通常是某个功能已开启但当前工作区未安装对应可选依赖。React / Next 相关预设会自动跳过；其他能力可通过 `pnpm add -D` 补齐。
- 与旧版 `.eslintrc` 混用时建议先改用 `icebreakerLegacy()`，逐步迁移至 Flat Config。
- Tailwind 校验依赖 `tailwind.config.*`，Monorepo 或自定义构建路径时请确认配置文件位置。

## 项目链接

- 文档：https://repoctl.icebreaker.top
- 仓库：https://github.com/icelib/repoctl/tree/main/packages/eslint
- 问题反馈：https://github.com/icelib/repoctl/issues
