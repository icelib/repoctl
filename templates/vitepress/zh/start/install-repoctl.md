---
title: 安装 repoctl
description: 在 pnpm monorepo 中安装 repoctl，初始化受管默认值并运行第一次仓库诊断。
---

# 安装 repoctl

把 repoctl 安装为开发依赖，让成员和 CI 使用同一个版本。

```bash
pnpm add -D repoctl
pnpm exec repo init
pnpm exec repo doctor
```

接着阅读[运行校验](/zh/tasks/checks)或[接入已有 workspace](/zh/tasks/adopt-existing)。
