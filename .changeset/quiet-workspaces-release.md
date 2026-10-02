---
"@icebreakers/monorepo": patch
"repoctl": patch
---

修复发布版本计算将私有 workspace 包递归纳入发布计划的问题，避免发布说明生成因私有依赖升级而中断。
