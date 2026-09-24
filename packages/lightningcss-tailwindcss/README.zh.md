# lightningcss-tailwindcss

用于分析 Tailwind CSS 语法的 Lightning CSS AST 工具集。

## 概览

这个包是在 **Lightning CSS AST** 之上做的一层 Tailwind 语法分析能力。

它可以提取：

- `@apply` 中的 utility candidate
- `theme(...)` 调用
- Tailwind import 指令
- 手写样式中声明的 utility selector
- 基于语法信号推断的 Tailwind 版本
- Lightning CSS 在容错解析过程中产生的 warning

如果你的工具链本身已经依赖 Lightning CSS AST，而你又想分析 Tailwind 相关语法，这个包会比较合适。

## 安装

```bash
pnpm add -D lightningcss-tailwindcss
```

## 适用场景

推荐在这些情况下使用 `lightningcss-tailwindcss`：

- 你的分析流程已经基于 `lightningcss`
- 你希望用 Rust 驱动的解析器 + JS visitor
- 你可以接受“恢复后”的 AST 输出

如果你需要更宽松的源码级解析、PostCSS 节点引用，或者需要解析使用方项目的 Tailwind 安装与配置，请使用 `postcss-tailwindcss`。

## API

- `parseTailwindCss(input)`
- `detectTailwindVersion(input)`
- `collectApplyCandidates(input)`
- `collectThemeCalls(input)`
- `collectImportDirectives(input)`
- `collectUtilitySelectors(input)`
- `analyzeTailwindCss(input)`

## 示例

```ts
import { analyzeTailwindCss } from 'lightningcss-tailwindcss'

const css = `
@import "tailwindcss" source(none) prefix(tw);

.button {
  @apply flex hover:bg-red-500;
  color: theme(colors.gray.900 / 75%);
}
`

const result = analyzeTailwindCss(css)

console.log(result.version)
console.log(result.applyCandidates.map(item => item.candidate))
console.log(result.warnings)
```

## 返回结果

`analyzeTailwindCss()` 返回：

```ts
interface TailwindAnalysis {
  version: 3 | 4 | 'unknown'
  applyCandidates: UtilityCandidate[]
  themeCalls: ThemeCall[]
  importDirectives: TailwindImportDirective[]
  utilitySelectors: UtilitySelector[]
  warnings: LightningWarning[]
}
```

和 PostCSS 版本不同，这里返回的是 Lightning CSS AST 片段与 `loc` 信息，而不是 PostCSS 节点对象。

## 解析特性

这个包内部依赖 Lightning CSS 的 `transform()`，并开启了 `errorRecovery: true`。

这意味着：

- 某些 Tailwind 扩展语法会以“容错恢复”的形式保留下来
- 对部分 Tailwind 特有写法出现 warning 是预期行为
- v4 的 `@import "tailwindcss" source(...) prefix(...)` 仍然可以被分析，即使 Lightning CSS 不会把它完全当成标准语法

## 与 `postcss-tailwindcss` 的区别

- 不提供 Tailwind 运行时/配置解析能力
- 不返回 PostCSS 节点
- AST 结果更偏“规范化输出”
- 更适合已经基于 Lightning CSS visitor 的工具

如果你还需要感知使用方项目里真实安装的 Tailwind 版本和配置文件位置，应该选 `postcss-tailwindcss`。

## 项目链接

- 文档：https://repoctl.icebreaker.top
- 仓库：https://github.com/icelib/repoctl/tree/main/packages/lightningcss-tailwindcss
- 问题反馈：https://github.com/icelib/repoctl/issues
