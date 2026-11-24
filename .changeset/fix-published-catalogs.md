---
'@icebreakers/monorepo-templates': patch
---

修复发布模板资产中的 pnpm catalog 依赖解析，确保生成的工作区可以在移除源仓库 catalog 后正常安装。
