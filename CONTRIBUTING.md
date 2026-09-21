# Contributing to repoctl

English | [简体中文](CONTRIBUTING.zh-CN.md)

repoctl accepts bug fixes, documentation improvements, tests, and focused feature proposals.

## Development setup

1. Use Node.js 22.13+ and enable Corepack.
2. Run `pnpm install`.
3. Create a focused branch from `main`.
4. Add or update tests with the implementation.

Before opening a pull request, run:

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm tsd
pnpm test
```

Changes to publishable packages require a pnpm change intent created with `pnpm change`. Commits must use Conventional Commit syntax.

Pull requests that change a publishable package receive an automatic `.changeset/auto-pr-<number>.md` intent when they come from a branch in this repository. The default bump is `patch`; add the `release:minor` or `release:major` label to override it. Fork pull requests cannot be written to by the workflow, so add the intent manually. Existing hand-written intents are always preserved.

To backfill merged pull requests that predate this automation, run the `Automatic Release Intent` workflow manually with a comma-separated list of PR numbers. The workflow opens one backfill pull request, and the next `repo release ci` run consumes its changesets normally.

The repository includes repoctl's CLI and monorepo engine, template assets, shared lint/config packages, and the `apps/mock` fixture demo. Keep package APIs and independent version lines intact when working across these areas.

When changing templates or managed root assets, update their source first and refresh packaged copies with `pnpm --filter @icebreakers/monorepo-templates sync:assets`.

Report bugs at https://github.com/icelib/repoctl/issues and use discussions for design questions that do not yet have a concrete implementation.
