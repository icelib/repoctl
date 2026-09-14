---
title: repoctl、pnpm 与 Turborepo
description: 了解 repoctl 如何与 pnpm、Turborepo 组合，构成现代 monorepo 工具链。
---

# repoctl、pnpm 与 Turborepo

pnpm 负责包和依赖，Turborepo 负责任务编排与缓存，repoctl 负责仓库流程、约定、诊断、模板、校验、报告和发布步骤。

| 工具      | 主要职责               |
| --------- | ---------------------- |
| pnpm      | workspace 包与依赖管理 |
| Turborepo | 任务流水线与缓存       |
| repoctl   | 仓库操作与引导式校验   |

阅读[什么是 repoctl](/zh/start/what-is-repoctl)或[安装 repoctl](/zh/start/install-repoctl)。
