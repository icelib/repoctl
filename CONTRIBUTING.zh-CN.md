# 为 repoctl 贡献

[English](CONTRIBUTING.md) | 简体中文

repoctl 接受缺陷修复、文档改进、测试补充和边界清晰的功能提案。

## 开发准备

1. 使用 Node.js 22.13+ 并启用 Corepack。
2. 运行 `pnpm install`。
3. 从 `main` 创建职责单一的分支。
4. 在实现功能的同时新增或更新测试。

提交 Pull Request 前依次运行：

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm tsd
pnpm test
```

修改可发布包时必须通过 `pnpm change` 创建变更意图。提交信息必须遵循 Conventional Commits。

修改可发布包的 PR 如果来自本仓库分支，工作流会自动生成 `.changeset/auto-pr-<number>.md`。默认升级级别为 `patch`，添加 `release:minor` 或 `release:major` 标签可覆盖默认值。Fork PR 无法由工作流写入源分支，因此需要作者手动添加 intent；已有的手写 intent 会始终保留。

对于自动化启用前已经合并的 PR，可以手动运行 `Automatic Release Intent` 工作流，并输入逗号分隔的 PR 编号。工作流会创建一个补录 PR，后续 `repo release ci` 会按正常流程消费其中的 changeset。

本仓库同时维护 repoctl CLI、monorepo engine、模板资产、共享 lint/config 包以及 `apps/mock` fixture demo。跨这些目录修改时，请保持包的公开 API 和独立版本线不变。

修改模板或受管根资产时，先修改源码，再运行 `pnpm --filter @icebreakers/monorepo-templates sync:assets` 刷新随包副本。

缺陷请提交到 https://github.com/icelib/repoctl/issues；尚未形成具体实现的设计问题请使用 Discussions。
