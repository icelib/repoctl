# repoctl

English | [简体中文](README.zh-CN.md)

`repoctl` is the recommended package for the repoctl CLI. The package name is `repoctl`; the primary executable is `repo`.

## Install

```bash
pnpm add -D repoctl
```

## Start with an existing workspace

```bash
pnpm exec repo init
pnpm exec repo doctor
pnpm exec repo templates
pnpm exec repo new my-package
pnpm exec repo check
```

Generated workspaces also expose conflict-free root scripts such as `repo:init`, `repo:doctor`, `repo:new`, and `repo:check`.

## Common workflows

```bash
# inspect or update a workspace
pnpm exec repo doctor --json
pnpm exec repo upgrade --yes

# preview creation without writing files
pnpm exec repo new dashboard --template vue-hono --json

# inspect verification before running it
pnpm exec repo check --dry-run
pnpm exec repo check --full

# collect a support bundle
pnpm exec repo env support --json --redact --out reports/support.json
```

## Language

Output is English by default. Use `--lang zh-CN` or `REPOCTL_LANG=zh-CN` for Simplified Chinese.

```bash
pnpm exec repo --lang zh-CN doctor
REPOCTL_LANG=zh-CN pnpm exec repo check --dry-run
```

## Advanced APIs

`repoctl` re-exports the programmatic APIs from `@icebreakers/monorepo`. Tooling wrappers are available from `repoctl/tooling`.

```ts
import { defineEslintConfig } from 'repoctl/tooling'

export default await defineEslintConfig()
```

## Project links

- Documentation: https://repoctl.icebreaker.top
- Repository: https://github.com/icelib/repoctl/tree/main/packages/repoctl
- Issues: https://github.com/icelib/repoctl/issues
