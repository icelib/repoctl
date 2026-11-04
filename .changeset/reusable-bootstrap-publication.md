---
"@icebreakers/monorepo": minor
"repoctl": minor
"@icebreakers/monorepo-templates": minor
---

新增 `repo release bootstrap` 与受管 Release 工作流的通用单包预览发布入口，复用冻结产物、OIDC、provenance 和隔离消费检查，支持新包及已有包验证 Trusted Publisher 的首次发布。提供不重建、不重新上传的原运行恢复验收，并支持按精确包名筛选 OIDC 审计；同步生成器、命令文档和公开 skill。
