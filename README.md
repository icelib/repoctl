# repoctl

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./brand/svg/repoctl-lockup-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./brand/svg/repoctl-lockup-primary.svg">
  <img alt="repoctl" src="./brand/svg/repoctl-lockup-primary.svg" width="300" height="64">
</picture>

[![codecov](https://codecov.io/gh/icelib/repoctl/branch/main/graph/badge.svg?token=mWA3D53rSl)](https://codecov.io/gh/icelib/repoctl)

English | [简体中文](README.zh-CN.md)

repoctl is a task-first CLI for initializing, maintaining, validating, and releasing pnpm and Turborepo monorepos. It works with existing workspaces and also ships optional templates for creating new packages and applications.

## What repoctl manages

- Workspace initialization and health checks with `repo init` and `repo doctor`.
- Package and application creation with `repo templates` and `repo new`.
- Repeatable local verification with `repo check` and the `repo verify` command group.
- Managed tooling configuration through `repoctl/tooling`.
- Shared lint/config packages and the `apps/mock` fixture demo maintained in this repository.
- Workspace upgrades that preserve unowned project files by default.
- Stable and prerelease publishing based on pnpm change intents.
- Machine-readable JSON and Markdown reports for CI, editors, and support workflows.

## Install

repoctl requires Node.js 22.13 or newer.

```bash
pnpm add -D repoctl
```

The package name is `repoctl`; the recommended command is `repo`.

```bash
pnpm exec repo init
pnpm exec repo doctor
pnpm exec repo templates
pnpm exec repo new my-package
pnpm exec repo check
```

Use `repoctl` when a longer, explicit executable name is preferable. Both bins expose the same commands.

## Create a workspace

```bash
npm create repoctl@latest
# or
pnpm create repoctl
```

The create command lets you select the built-in templates to include, then prepares the workspace for the normal `repo init`, `repo doctor`, `repo new`, and `repo check` workflow.

### For AI agents

```bash
pnpm create repoctl my-app -- --yes --templates vue-hono
cd my-app
pnpm install
pnpm exec repo init
pnpm exec repo doctor
```

Template keys: `vue-hono` (Vue/full-stack), `hono-server` (API), `tsdown` (TypeScript library), `vue-lib` (Vue components), `vitepress` (docs), `cli`. Omit `--templates` for an empty workspace, then `pnpm exec repo new <name> --template <key>`.

## Internationalization

CLI output is English by default. Select Simplified Chinese explicitly with either interface:

```bash
pnpm exec repo --lang zh-CN doctor
REPOCTL_LANG=zh-CN pnpm exec repo doctor
```

Supported locales are `en` and `zh-CN`. Machine-readable field names, check IDs, statuses, and command names remain stable in every locale.

## Packages

| Package                                                                 | Role                                                |
| ----------------------------------------------------------------------- | --------------------------------------------------- |
| [`repoctl`](packages/repoctl)                                           | Recommended CLI and public API entrypoint           |
| [`@icebreakers/monorepo`](packages/monorepo)                            | Core engine and advanced programmatic APIs          |
| [`@icebreakers/monorepo-templates`](packages/monorepo-templates)        | Built-in templates and managed workspace assets     |
| [`create-repoctl`](packages/create-repoctl)                             | Recommended `npm create` / `pnpm create` entrypoint |
| [`create-icebreaker`](packages/create-icebreaker)                       | Compatibility create entrypoint                     |
| [`@icebreakers/eslint-config`](packages/eslint)                         | Shared ESLint preset and framework integrations     |
| [`@icebreakers/stylelint-config`](packages/stylelint)                   | Shared Stylelint preset and CSS policy              |
| [`@icebreakers/commitlint-config`](packages/commitlint)                 | Typed Conventional Commits configuration            |
| [`@icebreakers/changelog-github`](packages/changelog-github)            | Changesets GitHub changelog formatter               |
| [`stylelint-plugin-tailwindcss`](packages/stylelint-plugin-tailwindcss) | Tailwind/UnoCSS Stylelint rules                     |
| [`postcss-tailwindcss`](packages/postcss-tailwindcss)                   | PostCSS Tailwind syntax analysis                    |
| [`lightningcss-tailwindcss`](packages/lightningcss-tailwindcss)         | Lightning CSS Tailwind syntax analysis              |

The workspaces under `templates/` are private source assets. They are shipped through `@icebreakers/monorepo-templates`; they are not independently published packages.

## Development

```bash
corepack enable
pnpm install
pnpm build
pnpm lint
pnpm typecheck
pnpm tsd
pnpm test
```

Use `pnpm change` for changes that affect a publishable package and inspect the release plan with `pnpm change status`.

The development packages are maintained in this repository alongside repoctl,
including their tests, fixtures, and demo application. Each publishable package
keeps its own npm version and release intent.

## Documentation

- Documentation: https://repoctl.icebreaker.top
- GitHub: https://github.com/icelib/repoctl
- Issues: https://github.com/icelib/repoctl/issues
- Security: [SECURITY.md](SECURITY.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)

## License

[MIT](LICENSE)
