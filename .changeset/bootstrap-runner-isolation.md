---
"@icebreakers/monorepo": patch
---

隔离发布校验测试继承的 OIDC 与 npm 凭据，使通用 bootstrap 的回归检查可以在正式 Release 工作流中运行，同时保留生产入口对带凭据准备进程的拒绝。
