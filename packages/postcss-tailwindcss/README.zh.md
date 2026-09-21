# postcss-tailwindcss

用于分析 Tailwind CSS 语法的 PostCSS AST 工具集。

## 概览

这个包专注于**分析**，不负责 transform。

它基于 PostCSS 解析 CSS，并提取下面这些 Tailwind 相关结构：

- `@apply` 中的 utility candidate
- `theme(...)` 函数调用
- Tailwind v4 的 `@import "tailwindcss" ...` 指令
- 手写样式里声明的 utility 风格类选择器
- 使用方项目中的 Tailwind 安装、配置和版本信息

适合用在：

- Stylelint 插件
- codemod
- 自定义 lint rule
- 迁移脚本
- 编辑器或 CLI 诊断工具

## 安装

```bash
pnpm add -D postcss-tailwindcss
```

## 适用场景

推荐在这些情况下使用 `postcss-tailwindcss`：

- 你的工具本身就是基于 PostCSS AST
- 你希望更宽松地处理 Tailwind 语法
- 你关注的是“源码分析”而不是“编译结果”
- 你需要按项目路径解析 Tailwind 安装和配置

如果你的工具链已经完全基于 Lightning CSS AST，优先使用 `lightningcss-tailwindcss`。

## API

- `parseTailwindCss(input)`
- `detectTailwindVersion(input)`
- `resolveTailwindRuntime(context)`
- `detectInstalledTailwindVersion(context)`
- `collectApplyCandidates(input)`
- `collectThemeCalls(input)`
- `collectImportDirectives(input)`
- `collectUtilitySelectors(input)`
- `analyzeTailwindCss(input)`

`input` 可以是 CSS 字符串，也可以是已有的 PostCSS `Root`。

`context` 结构如下：

```ts
interface TailwindResolutionContext {
  cwd: string
  tsconfigPath?: string
}
```

## 示例

```ts
import {
  analyzeTailwindCss,
  resolveTailwindRuntime,
} from 'postcss-tailwindcss'

const css = `
@import "tailwindcss" source(none) prefix(tw);

.button {
  @apply flex hover:bg-red-500;
  color: theme(colors.gray.900 / 75%);
}
`

const analysis = analyzeTailwindCss(css)
const runtime = resolveTailwindRuntime({
  cwd: process.cwd(),
})

console.log(analysis.version)
console.log(analysis.applyCandidates.map(item => item.candidate))
console.log(runtime.version)
console.log(runtime.configPath)
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
}
```

每一项都会保留原始 PostCSS 节点引用，方便下游工具做精确报错。

## Tailwind 运行时解析

`resolveTailwindRuntime()` 会尝试解析：

- 当前项目安装的 `tailwindcss/package.json`
- Tailwind 安装目录
- Tailwind CSS 样式入口
- 最近的 `tailwind.config.*`
- 已安装的 Tailwind 版本

解析策略是项目感知的：

- 默认先走标准 Node/package 解析
- 如果传入 `tsconfigPath`，还会额外考虑 `paths` / `baseUrl`

## 语法说明

- 会对 Tailwind v3 / v4 语法做启发式识别
- `theme(colors.gray.900 / 75%)` 会拆成 `path` 和 `opacity`
- `.hover\\:bg-red-500:hover` 这类转义 selector 会被还原成 `hover:bg-red-500`
- 这个包**不会**判断某个类名是否真的被 Tailwind 注册；它只负责提取和归一化语法

## 与 `stylelint-plugin-tailwindcss` 的关系

`stylelint-plugin-tailwindcss` 当前会复用这个包来做 selector 收集和 Tailwind 运行时解析。

这个包是底层分析层，Stylelint 插件是在其上叠加规则策略和报错逻辑。

## 项目链接

- 文档：https://repoctl.icebreaker.top
- 仓库：https://github.com/icelib/repoctl/tree/main/packages/postcss-tailwindcss
- 问题反馈：https://github.com/icelib/repoctl/issues
