---
"@icebreakers/monorepo": patch
"@icebreakers/monorepo-templates": patch
"repoctl": patch
---

修复发布中断后跨 runner 丢失 GitHub 元数据和后置 hook 的问题，增加版本来源校验、远端阶段检查点及幂等恢复保护。
