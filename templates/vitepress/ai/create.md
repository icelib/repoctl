---
description: Non-interactive recipe for AI agents to create a repoctl workspace with pnpm create repoctl@latest --yes.
outline: deep
---

# Create a project with repoctl (AI)

Use this page when an agent is asked to create a new project with repoctl.

## Empty directory

Use a new or empty directory outside the repoctl source checkout. Do not add a
business project inside the source workspace, and do not use a non-empty target
unless the user explicitly asks to replace it with `--force`. Do not prompt.
Run:

```bash
pnpm create repoctl@latest <dir> -- --yes --templates <keys>
cd <dir>
corepack enable
pnpm install
pnpm exec repo init
pnpm exec repo doctor
```

`npm create repoctl@latest <dir> -- --yes --templates <keys>` and
`npx create-repoctl@latest <dir> --yes --templates <keys>` are equivalent.
`pnpm create` and `npm create` need the extra `--` before flags.

## Template keys

| User intent              | `--templates` / `repo new --template` |
| ------------------------ | ------------------------------------- |
| Vue / full-stack web app | `vue-hono`                            |
| API / Hono service       | `hono-server`                         |
| TypeScript library / SDK | `tsdown`                              |
| Vue component library    | `vue-lib`                             |
| Documentation site       | `vitepress`                           |
| CLI                      | `cli`                                 |

Omit `--templates` when the intent is unclear. After init, create a package with:

```bash
pnpm exec repo new <name> --template <key>
```

## Existing workspace

If `pnpm-workspace.yaml` and a `repoctl` dependency already exist, do not run create. Use `repo new` instead, then `pnpm exec repo check`.
