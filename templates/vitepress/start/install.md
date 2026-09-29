# Install and initialize

This guide follows the order you would use when adding repoctl to a workspace.

## Prerequisites

- Node.js 22.13 or newer.
- pnpm. Corepack is recommended: `corepack enable`.
- Git. `repo doctor` reads repository metadata and checks the commit workflow.

Cloudflare templates additionally require Node.js 22.18+ for the cf configuration loader.

```bash
node -v
pnpm -v
git --version
```

## Install

```bash
pnpm add -D repoctl
```

If the repository was generated from this template, the dependency and root scripts may already be present.

## Initialize Defaults

```bash
pnpm install
pnpm exec repo init
pnpm exec repo doctor
```

| Command        | Purpose                                                                       |
| -------------- | ----------------------------------------------------------------------------- |
| `pnpm install` | Install workspace dependencies and local links                                |
| `repo init`    | Add recommended scripts, workspace patterns, and tooling entries              |
| `repo doctor`  | Check root files, Node version, CLI dependency, stale config files, and hooks |

Fix blocking issues reported by `doctor`, then run it again.

## Create A Package

List templates first:

```bash
pnpm exec repo templates
```

Create a TypeScript library:

```bash
pnpm exec repo new sdk --template tsdown
```

Preview before writing files:

```bash
pnpm exec repo new sdk --template tsdown --dry-run
pnpm exec repo new sdk --template tsdown --json --out plans/sdk.json
```

`--json` and `--out` imply `--dry-run`, which makes them suitable for CI, editor integrations, and scripts.

## Use Root Scripts

After `repo init`, daily commands can be shorter:

```bash
pnpm run repo:init
pnpm run repo:doctor -- --json
pnpm run repo:new -- sdk --template tsdown
pnpm run repo:check
```

| Root script                    | Equivalent CLI               |
| ------------------------------ | ---------------------------- |
| `pnpm run repo:init`           | `pnpm exec repo init`        |
| `pnpm run repo:doctor -- args` | `pnpm exec repo doctor args` |
| `pnpm run repo:new -- args`    | `pnpm exec repo new args`    |
| `pnpm run repo:check`          | `pnpm exec repo check`       |

## Verify Before Committing

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

Or use the repoctl verification entry:

```bash
pnpm run repo:check
pnpm exec repo check --dry-run
pnpm exec repo check --json --out reports/check-plan.json
```

## Sync Template Assets

```bash
pnpm exec repo upgrade
pnpm exec repo upgrade --no-overwrite
pnpm exec repo upgrade --yes
```

- `--no-overwrite` preserves changed managed files.
- `--yes` or `--overwrite` is for explicit automated overwrites.
- Non-TTY environments do not open interactive prompts.

## Next Steps

- Adopt an existing repository: [Adopt an existing workspace](/tasks/adopt-existing).
- Set team defaults: [Configuration](/reference/config).
- Inspect template keys: [Templates](/reference/templates).
- Share diagnostic output: [Troubleshoot](/tasks/troubleshooting).
