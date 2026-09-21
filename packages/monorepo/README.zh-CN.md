# @icebreakers/monorepo

[English](README.md) | 简体中文

repoctl 的 core engine 与程序化 API。

大多数用户应安装 [`repoctl`](https://www.npmjs.com/package/repoctl) 并使用 `repo` 命令。只有在需要底层 workspace、配置、诊断、发布或 tooling API 时，才需要直接安装本包。

```bash
pnpm add -D repoctl
pnpm exec repo doctor
```

```ts
import { getWorkspacePackageSummaries, runDoctor } from '@icebreakers/monorepo'

const workspace = await getWorkspacePackageSummaries(process.cwd())
const report = await runDoctor(workspace.workspaceDir)
```

本包为已有安装保留 `repo` 和 `repoctl` bin。新用户文档统一推荐 `repoctl` 包。

## 项目链接

- 文档：https://repoctl.icebreaker.top
- 仓库：https://github.com/icelib/repoctl/tree/main/packages/monorepo
- 问题反馈：https://github.com/icelib/repoctl/issues
