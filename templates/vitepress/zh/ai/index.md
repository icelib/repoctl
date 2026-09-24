---
description: repoctl 文档站的 AI 文档入口，说明如何为 AI 编程工具提供 llms.txt 和页面 Markdown。
---

# AI 文档

AI 文档入口用于给 Cursor、Claude Code、Codex 和其他 AI 编程工具提供更容易读取的上下文。它和工具专题分开维护，避免 llms.txt 被埋在普通工具列表里。

## 1. 推荐入口

| 入口                           | 用途                                             |
| ------------------------------ | ------------------------------------------------ |
| `/llms.txt`                    | 轻量文档索引，适合先交给 AI 工具判断要读哪些页面 |
| `/llms-full.txt`               | 合并后的完整文档，适合需要一次性提供上下文的场景 |
| [创建项目](./create.md)        | 非交互 `pnpm create repoctl@latest --yes` 配方   |
| [llms.txt 说明](./llms-txt.md) | 维护约定、访问方式和页面 frontmatter 要求        |

## 2. 在 AI 工具里怎么用

优先把 `https://repoctl.icebreaker.top/llms.txt` 作为入口提供给 AI 工具。只有当工具不能继续抓取链接，或者你需要离线提供完整上下文时，再使用 `https://repoctl.icebreaker.top/llms-full.txt`。

```txt
先给 llms.txt
  -> AI 选择相关页面
  -> 必要时补充 llms-full.txt
```

## 3. 维护原则

| 维护动作                          | 原因                                     |
| --------------------------------- | ---------------------------------------- |
| 新增重要页面时写 `description`    | 让 llms 索引更容易被模型理解             |
| 页面标题保持具体                  | 避免 AI 只看到泛化标题，无法判断页面用途 |
| repoctl、知识库、工具专题分开组织 | 让 AI 工具能按任务类型检索上下文         |
