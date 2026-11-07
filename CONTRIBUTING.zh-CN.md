# 为 repoctl 贡献

[English](CONTRIBUTING.md) | 简体中文

repoctl 接受缺陷修复、文档改进、测试补充和边界清晰的功能提案。

## 开发准备

1. 使用满足 `^22.23.4 || ^24.22.1 || >=26.12.1` 的 Node.js（推荐 24.22.1 LTS）。使用 Node.js 25+ 或找不到 `corepack` 命令时，先运行 `npm install --global corepack@0.36.0`，再运行 `corepack enable`。
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


## 依赖升级 PR 与 CI

依赖升级 PR 仍然要逐个审查；对于修改同一锁文件或同一依赖图、风险较低且相互兼容的升级，将已审查的变更批量放进一个短期集成 PR。集成分支必须从最新 `main` 创建，只带入已批准的 PR，统一解决一次锁文件冲突，并为每个可发布变更保留 release intent。如果 Renovate PR 没有自动生成 intent，应在集成 PR 中补充已审查的 intent，或先运行补录工作流再验证。

先运行受影响 workspace 的本地重点检查，再批准 `pr-ci`，等待集成 PR 的一轮完整 `PR Checks`。合并前确认当前 head SHA、`main` base SHA 与该轮运行冻结值一致，并确认 Release Intent、9 个 CI 矩阵、2 个 Dev Container 以及 PR Validation 全部成功。使用 `gh pr merge <number> --match-head-commit <verified-head>` squash 合并，然后在被替代的源 PR 中留言链接集成 PR 并关闭它们。

重大、草稿或高风险升级保持独立 PR。head 或 base 发生变化后不得复用旧的绿色运行。目前工作流没有监听 `merge_group`，因此 merge queue 不能减少这类验证成本；在工作流改变前，以集成 PR 批处理为准。

本仓库同时维护 repoctl CLI、monorepo engine、模板资产、共享 lint/config 包以及 `apps/mock` fixture demo。跨这些目录修改时，请保持包的公开 API 和独立版本线不变。

修改模板或受管根资产时，先修改源码，再运行 `pnpm --filter @icebreakers/monorepo-templates sync:assets` 刷新随包副本。

缺陷请提交到 https://github.com/icelib/repoctl/issues；尚未形成具体实现的设计问题请使用 Discussions。
