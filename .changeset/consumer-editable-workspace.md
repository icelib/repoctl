---
"@icebreakers/monorepo": patch
"repoctl": patch
---

修复 pnpm 12.18 消费 Nightly 和 PR snapshot 时无法追加安装例外的问题，使用可编辑的 YAML 配置并保留已确认批次的精确版本例外。
