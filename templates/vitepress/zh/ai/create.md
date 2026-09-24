---
description: 给 AI 代理用的非交互配方：pnpm create repoctl@latest --yes 创建 repoctl 工作区。
outline: deep
---

# 用 repoctl 创建项目（AI）

当代理被要求用 repoctl 创建新项目时，按本页执行。

## 空目录

目标目录应是 repoctl 源仓库之外的新目录或空目录。不要把业务项目放进
源仓库，也不要在非空目录上运行，除非用户明确要求使用 `--force` 覆盖。
不要提问，直接运行：

```bash
pnpm create repoctl@latest <dir> -- --yes --templates <keys>
cd <dir>
corepack enable
pnpm install
pnpm exec repo init
pnpm exec repo doctor
```

等价命令：`npm create repoctl@latest <dir> -- --yes --templates <keys>` 与
`npx create-repoctl@latest <dir> --yes --templates <keys>`。
`pnpm create` / `npm create` 的 flag 前必须加 `--`。

## 模板 key

| 用户意图            | `--templates` / `repo new --template` |
| ------------------- | ------------------------------------- |
| Vue / 全栈 Web      | `vue-hono`                            |
| API / Hono 服务     | `hono-server`                         |
| TypeScript 库 / SDK | `tsdown`                              |
| Vue 组件库          | `vue-lib`                             |
| 文档站              | `vitepress`                           |
| CLI                 | `cli`                                 |

意图不清时省略 `--templates`。初始化后再：

```bash
pnpm exec repo new <name> --template <key>
```

## 已有工作区

若已有 `pnpm-workspace.yaml` 和 `repoctl` 依赖，不要再跑 create。改用 `repo new`，然后 `pnpm exec repo check`。
