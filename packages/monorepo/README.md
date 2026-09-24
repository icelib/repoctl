# @icebreakers/monorepo

English | [简体中文](README.zh-CN.md)

Core engine and programmatic APIs for repoctl.

Most users should install [`repoctl`](https://www.npmjs.com/package/repoctl) and use the `repo` command. Install this package directly when you need its lower-level workspace, configuration, diagnostics, release, or tooling APIs.

```bash
pnpm add -D repoctl
pnpm exec repo doctor
```

## Programmatic usage

```ts
import {
  getWorkspacePackageSummaries,
  runDoctor,
} from '@icebreakers/monorepo'

const workspace = await getWorkspacePackageSummaries(process.cwd())
const report = await runDoctor(workspace.workspaceDir)
```

Tooling wrappers are available from either `@icebreakers/monorepo/tooling` or the recommended `repoctl/tooling` entrypoint.

## Compatibility

This package retains the `repo` and `repoctl` bins for existing installations. New user documentation recommends the `repoctl` package; the command surface is shared.

## Project links

- Documentation: https://repoctl.icebreaker.top
- Repository: https://github.com/icelib/repoctl/tree/main/packages/monorepo
- Issues: https://github.com/icelib/repoctl/issues
