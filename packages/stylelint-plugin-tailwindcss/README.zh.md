# stylelint-plugin-tailwindcss

一个面向“禁止手写样式逐渐 utility-first 化”的 Stylelint 插件。

它主要约束两件事：

- 不要在手写 CSS 里声明 `.flex`、`.grid`、`.text-center`、
  `.hover\:bg-red-500` 这类原子类选择器
- 当团队希望样式层更严格时，对 `@apply`、`theme(...)`、`@screen`
  等 Tailwind 风格语法施加额外限制

虽然包名偏 Tailwind，但它也提供了并行的 `unocss/*` 命名空间，因此在
UnoCSS 风格项目里也能复用同一套 Stylelint 工作流。

## 安装

```bash
pnpm add -D stylelint stylelint-plugin-tailwindcss
```

依赖运行时的规则会基于使用方项目做真实校验，而不是根据类名前缀猜测。
Tailwind 规则解析项目安装的 `tailwindcss` v3 或 v4 runtime；UnoCSS 规则
查找最近的 `uno.config.*` 或 `unocss.config.*`，并使用官方 UnoCSS generator。
缺少对应 runtime 或配置时，这些规则会保守地判定为不匹配。

## 快速开始

直接使用默认推荐 preset：

```ts
// stylelint.config.ts
import { recommended } from 'stylelint-plugin-tailwindcss'

export default recommended
```

使用最小基础 preset：

```ts
import { base } from 'stylelint-plugin-tailwindcss'

export default base
```

只启用单个命名空间：

```ts
import {
  tailwindRecommended,
  tailwindStrict,
  unocssRecommended,
  unocssStrict,
} from 'stylelint-plugin-tailwindcss'

export default tailwindRecommended
// 或
export default unocssRecommended
// 或
export default tailwindStrict
// 或
export default unocssStrict
```

保留默认双开，但关闭整组 UnoCSS：

```ts
import { recommended } from 'stylelint-plugin-tailwindcss'

export default {
  ...recommended,
  rules: {
    ...recommended.rules,
    'unocss/no-atomic-class': false,
    'unocss/no-invalid-apply': false,
    'unocss/no-apply': false,
    'unocss/no-arbitrary-value': false,
    'unocss/no-variant-group': false,
  },
}
```

## Preset 说明

### `base`

最小噪音的起点。只开启两套命名空间中最核心的选择器检查和 invalid
`@apply` 检查。

- `tailwindcss/no-atomic-class`
- `tailwindcss/no-invalid-apply`
- `unocss/no-atomic-class`
- `unocss/no-invalid-apply`

### `recommended`

默认推荐 preset。会同时启用两套命名空间，但只包含更适合作为通用推荐层
的低噪音规则。

Tailwind 规则：

- `tailwindcss/no-atomic-class`
- `tailwindcss/no-invalid-apply`
- `tailwindcss/no-apply`
- `tailwindcss/no-arbitrary-value`
- `tailwindcss/no-invalid-theme-function`

UnoCSS 规则：

- `unocss/no-atomic-class`
- `unocss/no-invalid-apply`
- `unocss/no-apply`
- `unocss/no-arbitrary-value`
- `unocss/no-variant-group`

### `tailwindBase`

只保留 Tailwind 命名空间的 `base`。

### `tailwindRecommended`

只保留 Tailwind 命名空间的 `recommended`。

### `strict`

最高约束层。在 `recommended` 的基础上，再额外开启更偏架构约束的
Tailwind 规则。

Tailwind 规则：

- `tailwindcss/no-atomic-class`
- `tailwindcss/no-invalid-apply`
- `tailwindcss/no-apply`
- `tailwindcss/no-arbitrary-value`
- `tailwindcss/no-theme-function`
- `tailwindcss/no-invalid-theme-function`
- `tailwindcss/no-screen-directive`
- `tailwindcss/no-tailwind-directive`
- `tailwindcss/no-import-directive`
- `tailwindcss/no-css-layer`

UnoCSS 规则：

- `unocss/no-atomic-class`
- `unocss/no-invalid-apply`
- `unocss/no-apply`
- `unocss/no-arbitrary-value`
- `unocss/no-variant-group`

### `tailwindStrict`

只保留 Tailwind 命名空间的 `strict`。

### `unocssBase`

只保留 UnoCSS 命名空间的 `base`。

### `unocssRecommended`

只保留 UnoCSS 命名空间的 `recommended`。

### `unocssStrict`

只保留 UnoCSS 命名空间的 `strict`。
当前会刻意与 `unocssRecommended` 保持一致。

## 会拦截什么

会被识别为 utility 选择器的典型例子：

- `.flex`
- `.grid`
- `.text-center`
- `.hover\:bg-red-500`
- `.md\:flex`
- `.\!mt-4`
- `.w-\[10px\]`

下面这类语义化类名不会被当作 utility 选择器：

- `.page-shell`
- `.card__body`
- `.hero-banner--primary`
- `.table-and-form`
- `.flex-layout`
- `.rounded-card`

## 检测模式

### Tailwind runtime

如果使用方项目安装了 Tailwind，插件会解析该项目真实安装的
`tailwindcss`，并基于真实 runtime 做判断。

如果无法从被检查文件解析到 Tailwind，`tailwindcss/no-atomic-class`、
`tailwindcss/no-invalid-apply` 等依赖 runtime 的规则不会根据 utility 风格
前缀继续猜测。

### UnoCSS runtime

UnoCSS 规则会从被检查文件所在目录向上查找 `uno.config.*` 或
`unocss.config.*`，再通过 `@unocss/core` 校验 candidate。找不到配置时，
依赖 runtime 的 UnoCSS 规则不会产生匹配结果。

当两个命名空间都识别出同一个手写选择器时，双开 preset 只会报告一次。

## 规则说明

### Tailwind 规则

- `tailwindcss/no-atomic-class`
  检查手写的 utility 选择器。
- `tailwindcss/no-invalid-apply`
  检查那些“看起来像 utility、但又不被当前 Tailwind runtime 识别为合法
  utility”的 `@apply` candidate。
- `tailwindcss/no-apply`
  只要出现 `@apply` 就报错。
- `tailwindcss/no-arbitrary-value`
  检查选择器或 `@apply` 中的 Tailwind 风格 arbitrary value /
  arbitrary property，例如 `w-[10px]`、`[mask-type:luminance]`。
- `tailwindcss/no-invalid-theme-function`
  检查 lookup path 无效的 `theme(...)` 调用。
- `tailwindcss/no-theme-function`
  检查所有 `theme(...)` 调用。会导出，但默认不包含在 `recommended`。
- `tailwindcss/no-screen-directive`
  检查 `@screen`。会导出，但默认不包含在 `recommended`。
- `tailwindcss/no-tailwind-directive`
  检查 `@tailwind`。会导出，但更适合迁移期或架构约束型 preset，因此默认
  不包含在 `recommended`。
- `tailwindcss/no-import-directive`
  检查 `@import "tailwindcss"` 这类入口导入。会导出，但更适合迁移期或架构
  约束型 preset，因此默认不包含在 `recommended`。
- `tailwindcss/no-css-layer`
  检查手写的 `@layer`。会导出，但默认不包含在 `recommended`，因为它也可能
  命中原生 CSS cascade layers。

### UnoCSS 规则

- `unocss/no-atomic-class`
  检查手写的 utility 选择器。
- `unocss/no-invalid-apply`
  检查那些“看起来像 utility、但又没通过当前 UnoCSS 配置与官方 generator
  校验”的 `@apply` candidate。
  它比 `unocss/no-apply` 更窄：像 `button-base` 这种语义 token 不会报，
  但 `bg-rd-500` 这类拼错、又明显长得像 utility 的 token 会报。
  `w-10px`、`text-rgb(255,0,0)` 这类 bare-value 形式在校验失败时也可能同
  时命中这里。
- `unocss/no-apply`
  只要出现 `@apply` 就报错。
- `unocss/no-arbitrary-value`
  检查选择器或 `@apply` 中的 UnoCSS arbitrary value。
  包括 `w-10px`、`w-50%`、`top--10px`、`bg-$brand`、
  `text-rgb(255,0,0)`、`translate-x-50%`、`outline-#fff`、
  `[&>*]:w-10px` 等裸值形式。
- `unocss/no-variant-group`
  检查 `hover:(bg-red-500 text-white)` 这类 UnoCSS variant group。

## 导出内容

这个包会导出：

- preset 对象，例如 `base`、`recommended`、`tailwindRecommended`、
  `unocssRecommended`
- rule name，例如 `noAtomicClassRuleName`、
  `unocssNoVariantGroupRuleName`
- plugin 实例，例如 `noAtomicClassPlugin`、
  `unocssNoVariantGroupPlugin`

如果你要做更细粒度的组合，可以直接按需导入 rule name 和 plugin。

## 配合 `@icebreakers/stylelint-config`

如果你已经在使用 `@icebreakers/stylelint-config`，通常不需要再手动注册这个
插件，因为该 preset 已经帮你接好了。

## 支持的文件类型

凡是 Stylelint 能处理的样式文件，它都可以工作，包括：

- `.css`
- `.scss`
- Vue SFC `<style>`
- Vue SFC `<style lang="scss">`

## Demo

仓库里提供了 IDE 友好的示例，位于
[`apps/mock/src/stylelint-demo`](/Users/yangqiming/Documents/GitHub/eslint-config/apps/mock/src/stylelint-demo)。

## 更多

更严格的 preset 说明见
[`docs/strict-preset.md`](/Users/yangqiming/Documents/GitHub/eslint-config/packages/stylelint-plugin-tailwindcss/docs/strict-preset.md)。

## 项目链接

- 文档：https://repoctl.icebreaker.top
- 仓库：https://github.com/icelib/repoctl/tree/main/packages/stylelint-plugin-tailwindcss
- 问题反馈：https://github.com/icelib/repoctl/issues
