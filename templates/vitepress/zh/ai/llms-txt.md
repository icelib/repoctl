---
description: 使用 llms.txt 为大语言模型提供更易读取的 repoctl 文档入口。
---

# AI 文档入口：llms.txt

`llms.txt` 是面向大语言模型的文档入口文件。它把站点中的关键页面整理成更适合模型读取的 Markdown 索引，便于 AI 工具在回答 repoctl、pnpm workspace、Turborepo 和模板用法相关问题时快速定位上下文。

本站通过 `vitepress-plugin-llms` 在构建阶段自动生成这些文件：

| 文件             | 用途                             |
| ---------------- | -------------------------------- |
| `/llms.txt`      | 文档索引，列出可供模型读取的页面 |
| `/llms-full.txt` | 把站点文档合并成单个文本文件     |
| 页面 `.md` 文件  | 保留每个页面内容的 Markdown 版本 |

## 1. 使用方式

访问 `https://repo.icebreaker.top/llms.txt` 可以获取当前文档的 LLM 索引。如果需要一次性提供完整上下文，可以使用 `https://repo.icebreaker.top/llms-full.txt`。

当你在 Cursor、Claude Code、Codex 或其他 AI 编程工具里引用 repoctl 文档时，优先提供 `llms.txt`，再按需要补充具体页面链接。

## 2. 维护约定

新增重要文档页面时，在 frontmatter 中补充 `description`。构建插件会把描述写入 `llms.txt` 的链接说明中，让模型更容易判断每个页面的用途。

```md
---
description: 说明这个页面解决的问题和适用场景。
---
```

## 3. 页面组织建议

AI 入口应该保持显眼，但不要替代正常文档结构：

| 页面类型                               | 推荐位置                                          |
| -------------------------------------- | ------------------------------------------------- |
| repoctl 命令、校验、诊断、报告         | `/start/`                                         |
| monorepo 和 npm 包基础知识             | `/learn/`、`/learn/monorepo/`、`/learn/packages/` |
| pnpm、Turborepo、versioning 等工具专题 | `/learn/tools/`                                   |
| llms.txt 和 AI 工具读取约定            | `/ai/`                                            |
