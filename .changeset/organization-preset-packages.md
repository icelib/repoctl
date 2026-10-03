---
"@icebreakers/monorepo": minor
"repoctl": minor
"@icebreakers/monorepo-templates": patch
---

支持固定版本的组织预设 npm 包，以纯 JSON 组合配置、模板、能力建议和有独立归属记录的工程资产。配置检查显示分层来源，资产应用提供只读计划、三方合并、冲突检查和事务回滚。

组织预设精确依赖升级可接入维护 PR 工作流：仅合并已有归属文件，发布阶段按工作流固定策略、提交中的包版本及基线 hash 独立校验，兼容既有 repoctl 维护报告。
