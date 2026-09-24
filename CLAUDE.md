# CLAUDE.md

This file provides repository-specific guidance for AI-assisted changes.

This is the **repoctl source workspace**. If a user asked you to create a new
business project, do not add apps here. Use a new or empty directory outside
this source checkout: `pnpm create repoctl@latest <dir> -- --yes --templates <keys>`.
After entering the generated project, run `corepack enable` before installing
dependencies so pnpm uses the version declared by the workspace.

## Product

repoctl is a task-first CLI for initializing, diagnosing, creating, validating, upgrading, and releasing pnpm and Turborepo monorepos. The repository itself is the repoctl source workspace; templates are one product capability, not the repository's identity.

## Architecture

- `packages/repoctl`: recommended package, `repo` and `repoctl` bins, and public re-exports.
- `packages/monorepo`: core engine, commands, reports, release orchestration, and tooling APIs.
- `packages/monorepo-templates`: published built-in templates and managed workspace assets.
- `packages/create-repoctl`: primary create command.
- `packages/create-icebreaker`: compatibility create command.
- `templates/*`: private source workspaces copied into the template-assets package.
- `templates/vitepress`: repoctl documentation source and the VitePress template source.

## Commands

The workspace requires Node.js 22.13+ and pnpm 12.

```bash
pnpm install
pnpm build
pnpm lint
pnpm typecheck
pnpm tsd
pnpm test
```

Run verification in that order. Build first so tests and type tests exercise delivery artifacts. Refresh managed assets with:

```bash
pnpm --filter @icebreakers/monorepo-templates sync:assets
```

Do not edit generated template copies or VitePress `.vitepress/dist` output manually.

## Product contracts

- The package name is `repoctl`; `repo` is the recommended command.
- `@icebreakers/monorepo`, `@icebreakers/monorepo-templates`, and `create-icebreaker` are supported compatibility or implementation packages.
- CLI output defaults to English. `--lang zh-CN` and `REPOCTL_LANG=zh-CN` select Simplified Chinese.
- JSON keys, command names, check IDs, and statuses are language-independent.
- Documentation defaults to English at `/`; Simplified Chinese lives under `/zh/`.

## Release workflow

Use `pnpm change` for publishable changes and inspect the result with `pnpm change status`. `pnpm exec repo release ci` owns Release PR preparation, npm publishing, tags, and GitHub Releases. Do not add release orchestration back to GitHub Actions.

## Code quality

Use folder-based decomposition when touched code exceeds 300 lines. All changed TypeScript and Vue files must pass ESLint and typecheck; style files must pass Stylelint. New or changed public TypeScript APIs require `tsd` coverage.
