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

## Release notes for fixed version groups

Packages in the same `versioning.fixed` group share version bumps. When only the main package declares a change intent, pnpm may generate a `CHANGELOG.md` containing just a version heading for the other packages in the group.

Starting with repoctl 5.8.0, the release PR includes those packages in its count and version table with a “Version-only release; no package-specific changelog entries.” maintenance entry. It does not copy the main package's feature notes or commit attribution to platform packages. pnpm still owns the changelog files. Declare a change intent for a platform package when it has its own changes to describe.

If an older release PR omits these packages, upgrade the tool and lockfile on your workspace's main branch, then let the release workflow regenerate the PR after merging:

```bash
pnpm add -Dw repoctl@^5.8.0
```

## Sync published packages to npmmirror

Use the HTTP API directly; cnpm is not required.

```bash
pnpm exec repo release sync-npmmirror --all
pnpm exec repo release sync-npmmirror --package repoctl --version 5.8.1
pnpm exec repo release sync-npmmirror --all --dry-run
```

Choose exactly one of `--all`, `--package <name>`, or `--published`. With no explicit version, manual commands use the versions currently referenced by npm dist-tags. Private workspaces and packages explicitly targeting another registry are excluded from `--all`; packages not yet published on npm are reported as skipped.

For automatic synchronization, add `"release:sync-npmmirror": "repo release sync-npmmirror --published"` to the root scripts and append this hook to `commands.release.hooks.afterPublish`:

```json
{ "script": "release:sync-npmmirror", "continueOnError": true, "idempotent": true }
```

The hook reads `REPO_RELEASE_PUBLISHED_PACKAGES` or `REPO_RELEASE_PUBLISH_SUMMARY`; an empty list skips synchronization, while missing or invalid input fails explicitly. Existing hooks remain in place.

The command submits tasks with dependency synchronization disabled, waits for task completion, then verifies versions and their current dist-tags through the public mirror registry. The total budget defaults to 300 seconds (`--timeout <seconds>`), including requests and retries, with concurrency 2. A failed manual run exits nonzero and prints retry commands. In GitHub Actions it emits warnings and a step summary; the optional hook preserves the successful npm release.

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

Doctor supports precise rule selection, reasoned suppression, and reviewed safe script fixes:

```bash
repo doctor --list-rules
repo doctor --rules root-scripts,package-manager --strict
repo doctor --rules root-scripts --fix --out plans/doctor-fix.json
repo doctor --apply plans/doctor-fix.json --json
```
