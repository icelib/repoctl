# @icebreakers/stylelint-config

## 概览

`@icebreakers/stylelint-config` 为 Vue + SCSS 技术栈提供开箱即用的 Stylelint 预设，并附带一个 CLI，可快速生成编辑器配置。它在上游推荐规则的基础上，补充了常用的单位白名单、UnoCSS / Tailwind 指令忽略项，以及默认启用的 Tailwind 原子类声明拦截规则，同时保留对预设开关和自定义规则的控制能力。

## 环境要求

- Node.js 22.13+
- Stylelint 16（支持 Flat Config）

## 安装

```bash
pnpm add -D stylelint @icebreakers/stylelint-config
```

全新项目可以直接运行 CLI 初始化 VS Code 设置：

```bash
npx @icebreakers/stylelint-config
```

该命令会创建或更新 `.vscode/settings.json`，为 VS Code 添加 `stylelint.validate` 条目，确保代码诊断来自 Stylelint 而非内置 CSS 校验器。同时它会把 `css`、`less`、`scss`、`pcss`、`postcss` 从 `eslint.validate` 中移除，避免 ESLint 与 Stylelint 在保存时同时改同一个样式文件。

## 基本用法

```ts
// stylelint.config.ts
import { icebreaker } from '@icebreakers/stylelint-config'

export default icebreaker({
  miniProgram: true,
})
```

`icebreaker()` 现在可直接接收和 `createStylelintConfig()` 相同的选项；
对小程序模板来说，最小配置就是 `miniProgram: true`。

## 进阶配置

若需细粒度控制预设、忽略列表或规则，可使用 `createStylelintConfig`：

```ts
import { createStylelintConfig } from '@icebreakers/stylelint-config'

export default createStylelintConfig({
  miniProgram: true,
  formattingPreset: 'safe',
  tailwindcssPreset: 'recommended',
  presets: {
    vue: false, // 纯 SCSS 项目无需 Vue 规则
  },
  ignores: {
    units: ['upx'], // 覆盖默认单位白名单
    addAtRules: ['tailwind'],
  },
  extends: ['@acme/stylelint-config'],
  overrides: [
    {
      files: ['**/*.html'],
      customSyntax: 'postcss-html',
    },
  ],
  rules: {
    'color-hex-length': 'long',
  },
})
```

### 覆盖或禁用规则

通过 `rules` 传入的规则会在内置 preset 和默认规则之后合并，因此同名规则会
覆盖内置值。需要禁用某条规则时，将它设置为 `null`：

```ts
// stylelint.config.ts
import { createStylelintConfig } from '@icebreakers/stylelint-config'

export default createStylelintConfig({
  rules: {
    // 覆盖内置 warning，改为 error。
    'property-no-vendor-prefix': true,

    // 替换默认的 BEM/OOCSS 类名规则。
    'selector-class-pattern': [
      '^[a-z][a-zA-Z0-9]+$',
      { resolveNestedSelectors: true },
    ],

    // 禁用默认 `base` preset 启用的四条 utility guard。
    'tailwindcss/no-atomic-class': null,
    'tailwindcss/no-invalid-apply': null,
    'unocss/no-atomic-class': null,
    'unocss/no-invalid-apply': null,
  },
})
```

使用 `icebreaker({ rules: { ... } })` 时，`rules` 的覆盖行为完全相同。

### 配置说明

- `miniProgram`：默认忽略小程序常见产物目录：`dist/**`、`.weapp-vite/**`、`node_modules/**`、`miniprogram_npm/**`
- `presets.scss`：是否包含 `stylelint-config-standard-scss`，默认开启
- `presets.vue`：是否包含 `stylelint-config-recommended-vue/scss`，默认开启
- `presets.order`：是否包含 `stylelint-config-recess-order`，默认开启
- `formattingPreset`：是否启用面向 `--fix` 的保守格式化约定层。`'safe'` 表示启用，`'off'`（默认）表示只保留 lint 预设。
- `tailwindcssPreset`：选择内置 utility 策略层，支持 `'base'`（默认）、`'recommended'` 或 `'strict'`
- `ignores.*`：替换默认的忽略列表（单位、选择器类型、指令）
- `ignores.add*`：在默认忽略列表基础上追加项
- `extends`：在预设之后追加自定义 Stylelint 配置
- `overrides`：声明文件级别的覆盖（如指定 `customSyntax`）
- `rules`：合并额外 Stylelint 规则

默认行为包括：

- 允许 BEM / OOCSS 风格的类名（如 `block__element--modifier`、`object--state`）
- 允许 `rpx` 单位，兼容小程序
- 将 `property-no-vendor-prefix` 降级为 warning；小程序模式下关闭该规则，允许 `-webkit-background-clip` 等平台前缀属性
- 忽略 Tailwind / UnoCSS 常见指令（如 `apply`、`screen`）
- 禁止在手写样式中声明 `.flex`、`.hover\:bg-red-500` 这类 Tailwind 原子类选择器
- 忽略多端平台常见的 `page` 选择器

### Safe Formatting 预设

如果你希望样式文件的部分可修复格式约定由 Stylelint 承担，可以开启：

```ts
import { createStylelintConfig } from '@icebreakers/stylelint-config'

export default createStylelintConfig({
  formattingPreset: 'safe',
})
```

`formattingPreset: 'safe'` 是一层刻意保守的配置，只包含 Stylelint 16+
仍支持、且 `--fix` 行为稳定的规则，例如：

- 使用现代颜色函数写法（如 `rgba()` 转成 `rgb(... / ...)`）
- 为 `url(...)` 补齐引号
- 为属性选择器值补齐引号
- 将冗余的 longhand 属性折叠为 shorthand
- 移除冗余的 shorthand 值

它不是 Prettier 那种“完整格式化器”，而是一层适合配合
`stylelint --fix` 使用的可修复约定集。

## 小程序模板推荐用法

### 原生小程序最小配置

```ts
import { icebreaker } from '@icebreakers/stylelint-config'

export default icebreaker({
  miniProgram: true,
})
```

推荐脚本：

```bash
stylelint "**/*.{css,scss,wxss,vue}" --fix
```

### Vue / wevu 模板最小配置

```ts
import { icebreaker } from '@icebreakers/stylelint-config'

export default icebreaker({
  miniProgram: true,
})
```

该配置默认兼容 `.css`、`.scss`、`.wxss` 以及 Vue SFC 的 `<style>`，
无需手动处理 `postcss-html`、Vue preset 或小程序 ignore 路径。

## Tailwind 原子类拦截

该预设默认启用 `stylelint-plugin-tailwindcss` 的 `base` 策略层，对应规则为：

```txt
tailwindcss/no-atomic-class
tailwindcss/no-invalid-apply
unocss/no-atomic-class
unocss/no-invalid-apply
```

这些默认规则会：

- 拦截在样式文件中直接声明 Tailwind / UnoCSS utility selector，但不会影响正常的语义化类名，例如 BEM / OOCSS 风格命名
- 拦截无效的 `@apply` utility candidate

如果你需要更完整的日常策略层，可以切到：

```ts
import { createStylelintConfig } from '@icebreakers/stylelint-config'

export default createStylelintConfig({
  tailwindcssPreset: 'recommended',
})
```

这会额外启用：

- `tailwindcss/no-apply`
- `tailwindcss/no-arbitrary-value`
- `tailwindcss/no-invalid-theme-function`
- `unocss/no-apply`
- `unocss/no-arbitrary-value`
- `unocss/no-variant-group`

如果你需要更严格、偏架构约束的 Tailwind 策略层，可以切到：

```ts
import { createStylelintConfig } from '@icebreakers/stylelint-config'

export default createStylelintConfig({
  tailwindcssPreset: 'strict',
})
```

这会在默认策略上额外启用这些 Tailwind 规则：

- `tailwindcss/no-theme-function`
- `tailwindcss/no-screen-directive`
- `tailwindcss/no-tailwind-directive`
- `tailwindcss/no-import-directive`
- `tailwindcss/no-css-layer`

底层插件同时兼容 Tailwind CSS v3 和 v4，会根据使用方项目实际安装的 `tailwindcss` 主版本自动切换检测逻辑。UnoCSS 规则会查找最近的 `uno.config.*` 或 `unocss.config.*`，并通过官方 generator 校验。缺少对应 Tailwind runtime 或 UnoCSS 配置时，依赖运行时的规则不会根据类名前缀猜测，因此 `.table-and-form`、`.flex-layout` 等语义类名可以正常使用；两个 runtime 同时识别同一选择器时，双开 preset 也只报告一次。

## 推荐脚本

- `pnpm --filter @icebreakers/stylelint-config build` 构建 `dist/` 产物。
- 在应用内新增 `lint:styles` 脚本，例如 `stylelint "src/**/*.{css,scss,vue}" --fix`。

## 常见问题

- Tailwind 指令需要在 `postcss.config.*` 中配合忽略列表，否则可能误报，可通过 `ignores.addAtRules` 添加新指令。
- 如果 Stylelint 无法解析预设，请确认包已安装在当前 workspace 的 `devDependencies` 中，或已正确 hoist。
- 建议使用 CLI 生成的 VS Code 设置，避免内置 CSS 校验、ESLint 与 Stylelint 对样式文件重复报错或冲突修复。

## 项目链接

- 文档：https://repoctl.icebreaker.top
- 仓库：https://github.com/icelib/repoctl/tree/main/packages/stylelint
- 问题反馈：https://github.com/icelib/repoctl/issues
