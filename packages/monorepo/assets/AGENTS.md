# Agent instructions

This workspace is managed by **repoctl**. The recommended command is `repo`.
Use `repoctl` only when a longer executable name is clearer. Do not treat this
repository as the repoctl source project.

## Create packages and apps

```bash
pnpm exec repo templates
pnpm exec repo new <name> --template <key>
```

| Intent                   | Template key  |
| ------------------------ | ------------- |
| Vue / full-stack web app | `vue-hono`    |
| API / Hono service       | `hono-server` |
| TypeScript library / SDK | `tsdown`      |
| Vue component library    | `vue-lib`     |
| Documentation site       | `vitepress`   |
| CLI                      | `cli`         |

Preview without writing files: `pnpm exec repo new <name> --template <key> --dry-run`.

## Create a new project

If the user asks you to create a new business project, do not add it inside an
existing unrelated repository. Use a new or empty directory outside the repoctl
source checkout. Start a new workspace with:

```bash
pnpm create repoctl@latest <dir> -- --yes --templates <keys>
cd <dir>
corepack enable
pnpm install
pnpm exec repo init
pnpm exec repo doctor
```

## Verify

```bash
pnpm exec repo doctor
pnpm exec repo check
```

## Do not

- Do not add packages by copying folders. Use `repo new`.
- Do not hand-edit managed root configs that `repo init` / `repo upgrade` own.
- Do not invent publish versions by hand. Use `pnpm change` for publishable packages.

## Requirements

- Node.js 22.13 or newer
- pnpm (run `corepack enable` so the declared workspace version is used)
- CLI output is English by default; `--lang zh-CN` or `REPOCTL_LANG=zh-CN` selects Simplified Chinese
