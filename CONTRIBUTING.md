# Contributing to repoctl

English | [简体中文](CONTRIBUTING.zh-CN.md)

repoctl accepts bug fixes, documentation improvements, tests, and focused feature proposals.

## Development setup

1. Use Node.js matching `^22.23.4 || ^24.22.1 || >=26.12.1` (24.22.1 LTS recommended). On Node.js 25+ or if `corepack` is unavailable, first run `npm install --global corepack@0.36.0`; then run `corepack enable`.
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


## Dependency upgrade PRs and CI

Review each dependency upgrade PR on its own, then batch compatible low-risk upgrades that touch the same lockfile or dependency graph into one short-lived integration PR. Start the integration branch from the latest `main`, bring in only the reviewed PRs, resolve the lockfile once, and preserve a release intent for every publishable change. If a Renovate PR has no automatically generated intent, add the reviewed intent in the integration PR or use the backfill workflow before validation.

Run focused local checks for the affected workspaces, then approve `pr-ci` and wait for one complete `PR Checks` run on the integration PR. Before merging, verify that the current head SHA and `main` base SHA are the frozen values for that run, and that Release Intent, all nine CI matrix jobs, both Dev Container jobs, and PR Validation succeeded. Squash merge with `gh pr merge <number> --match-head-commit <verified-head>` and close the superseded source PRs with a link to the integration PR.

Keep major, draft, or high-risk upgrades in separate PRs. Never reuse a green run after its head or base changes. The current workflows do not listen to `merge_group`, so merge queue does not reduce this validation cost; the integration PR is the batching mechanism until that changes.

The repository includes repoctl's CLI and monorepo engine, template assets, shared lint/config packages, and the `apps/mock` fixture demo. Keep package APIs and independent version lines intact when working across these areas.

When changing templates or managed root assets, update their source first and refresh packaged copies with `pnpm --filter @icebreakers/monorepo-templates sync:assets`.

Report bugs at https://github.com/icelib/repoctl/issues and use discussions for design questions that do not yet have a concrete implementation.
