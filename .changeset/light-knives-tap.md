---
"@icebreakers/stylelint-config": major
"stylelint-plugin-tailwindcss": minor
"eslint-plugin-better-stylelint": minor
"@icebreakers/monorepo": patch
"repoctl": patch
"@icebreakers/monorepo-templates": patch
---

支持 Stylelint 18，并保留兼容的 SCSS 规则预设。

同步发布 Tailwind Stylelint 插件与 ESLint 桥接，并为 CLI 保留 Stylelint 17/18 peer 兼容范围。

修复 ESLint 桥接打包后的 worker 定位，保留多样式块诊断上下文并避免规则名后缀重复，将其公开入口回归纳入根测试。

文档模板将 Astro 的 cookie 依赖随预渲染入口打包，避免嵌套项目错误加载父项目的旧版依赖。
