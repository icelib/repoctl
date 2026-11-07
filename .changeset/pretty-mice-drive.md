---
"@icebreakers/stylelint-config": patch
"@icebreakers/eslint-config": patch
---

构建时打包固定的 SCSS 插件与 Vue、排序预设实现并保留许可证，移除发布包中不兼容 Stylelint 18 的传递 peer 依赖；保留 SCSS 指令的专用规则校验，修复合法 @mixin 被核心规则误报；新增隔离 tarball 严格安装、CSS/SCSS/Vue/WXSS 规则与修复以及 ESLint 样式桥接验证。
