---
'@icebreakers/monorepo': patch
repoctl: patch
---

fix(release): 保留变更说明显式声明的功能、修复、性能、文档和破坏性变更分类，避免来源提交或升版标题覆盖意图；说明提及依赖版本时保留正文，使发布 PR 与最终 GitHub Release 分类一致。
