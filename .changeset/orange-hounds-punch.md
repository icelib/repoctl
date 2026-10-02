---
"@icebreakers/monorepo": patch
"repoctl": patch
"@icebreakers/monorepo-templates": patch
---

修复 pre-push 使用固定源码目录导致新工作区漏测：按 pnpm 清单动态发现私有和嵌套工作区，保留显式覆盖，并校验删除及跨包重命名的两侧文件。同步中英文校验文档，并兼容 Windows 的 pnpm 命令包装器。
