---
description: repoctl 文档站的工具专题入口，汇总 pnpm、Turborepo、版本管理、Lefthook 和 Renovate。
---

# 工具专题

工具专题只讲 repoctl 周边工具。repoctl 会把这些工具串成稳定工作流，但每个工具本身仍有独立的配置模型和维护边界。

## 1. 工具地图

| 工具            | 在 repoctl 工作流里的位置                 | 详细页面                     |
| --------------- | ----------------------------------------- | ---------------------------- |
| pnpm            | workspace、依赖安装、根脚本和包内脚本执行 | [pnpm](./pnpm.md)            |
| Turborepo       | build、lint、typecheck、test 等任务编排   | [turborepo](./turborepo.md)  |
| pnpm versioning | 多包版本、变更记录和发布准备              | [versioning](./changeset.md) |
| Lefthook        | Git hook 入口                             | [Lefthook](./lefthook.md)    |
| Renovate        | 依赖更新和升级 PR 治理                    | [renovate](./renovate.md)    |

## 2. 和 repoctl 的关系

repoctl 不隐藏这些工具。它主要做三件事：

1. 生成推荐配置，减少每个仓库重复复制。
2. 提供 `doctor` 和 `check`，帮助你验证配置是否接上。
3. 提供 `upgrade`，在模板标准发生变化时同步资产。

因此排障时不要只看 repoctl 命令。比如 `repo check --full` 失败时，真正失败的任务可能是 `pnpm lint`、`pnpm typecheck`、某个 workspace 的 `build` 或 `test`。

## 3. 按目标阅读

| 目标                      | 建议页面                          |
| ------------------------- | --------------------------------- |
| 让 workspace 包能互相引用 | [pnpm](./pnpm.md)                 |
| 提升整仓任务速度          | [turborepo](./turborepo.md)       |
| 建立规范发版链路          | [pnpm versioning](./changeset.md) |
| 提交前自动修复格式和 lint | [Lefthook](./lefthook.md)         |
| 降低依赖升级成本          | [Renovate](./renovate.md)         |
