# Templates

repoctl templates are maintained by `@icebreakers/monorepo-templates`. The CLI, scaffolder, and docs share the same template metadata.

## Built-In Templates

| Key           | Category | Default target     | Use case                |
| ------------- | -------- | ------------------ | ----------------------- |
| `tsdown`      | library  | `packages/tsdown`  | TypeScript library      |
| `vue-lib`     | library  | `packages/vue-lib` | Vue 3 component library |
| `vue-hono`    | app      | `apps/client`      | Vue 3 + Hono app        |
| `hono-server` | service  | `apps/server`      | Hono API service        |
| `vitepress`   | docs     | `apps/website`     | VitePress docs site     |
| `cli`         | tool     | `apps/cli`         | TypeScript CLI          |

## Discover Templates

```bash
repo templates
repo templates tsdown
repo templates --category library
repo templates --json
repo templates --markdown --out docs/templates.md
```

## Create From A Template

```bash
repo new sdk --template tsdown
repo new ui --template vue-lib
repo new api --template hono-server
repo new website --template vitepress
repo new toolbox --template cli
```

Simple names are placed in the conventional target folder. Library templates go under `packages/`; app templates go under `apps/`. If you pass an explicit path such as `packages/shared-utils`, repoctl respects it.

## Choose By Goal

### Publish an npm library

```bash
repo new sdk --template tsdown
```

Check first:

- `package.json` `name`, `exports`, and `types`.
- Whether `tsdown.config.ts` matches the desired output format.
- Whether public types need `tsd` tests.

### Build reusable Vue components

```bash
repo new ui --template vue-lib
```

Check first:

- Component entry points only expose stable APIs.
- Styles pass Stylelint.
- A docs site or example app should be created alongside it if needed.

### Create an app or service

```bash
repo new web --template vue-hono
repo new api --template hono-server
```

Check first:

- Runtime environment variables and deployment constraints.
- `dev`, `build`, and `typecheck` scripts are part of root tasks.
- CI needs integration or E2E tests.

### Cloudflare Worker types

Cloudflare templates require Node.js 22.18+ and use the pinned `cf` beta CLI with `cloudflare.config.ts`. The Vue template uses Cloudflare Vite plugin v2 beta; Hono and VitePress retain Wrangler internally as cf's build/development implementation. Application scripts use cf directly.

The `vue-hono` and `hono-server` templates run `cf workers types` before `dev`, `build`, and `typecheck`, generating `.cloudflare/types/index.d.ts`. Bindings are inferred from the configuration; runtime types follow the compatibility date and flags. `.cloudflare` is ignored and excluded from published templates.

Use `pnpm cf-typegen` to generate declarations. `pnpm cf-typegen:check` compares expected declarations in memory without creating or modifying them. Missing, stale, or corrupted output and invalid configuration fail the check. This adapter uses the same pinned `@cloudflare/config` and `@cloudflare/runtime-types` versions as cf because cf currently has no `types --check` command. Binding edits can update inferred types without changing the declaration text; `typecheck` validates their usage.

For existing projects, migrate on a branch: upgrade Node, install the pinned toolchain from the current template, and run `pnpm exec cf migrate`. Resolve its follow-ups, move Vite development settings into `vite.config.ts`, and keep Wrangler implementation settings in `wrangler.config.ts` where needed. Update package scripts, the Worker tsconfig type path, and Turbo inputs/outputs from the matching template; include its `scripts/check-worker-types.mjs`. Ignore `.cloudflare`, remove any tracked `worker-configuration.d.ts`, and remove the old Wrangler JSON/TOML configuration after checking every migrated field. Run build, typecheck, type checks, local development, and deployment dry-run before switching your CI commands. repoctl does not automatically migrate existing app configurations.

### Create a docs site

```bash
repo new docs --template vitepress
```

Check first:

- Nav and sidebar are organized around the product or package.
- A second locale is required.
- `repo templates --markdown` output should be written into docs.

### Create a CLI

```bash
repo new toolbox --template cli
```

Check first:

- The `bin` field matches the final command name.
- Argument parsing, exit codes, and help output are testable.
- README documents command usage.

## Preview Creation

```bash
repo new website --template vitepress --dry-run
repo new website --template vitepress --json
repo new website --template vitepress --json --out plans/website.json
```

`--dry-run` does not write files. It shows the template, source directory, target directory, package name, and output files.

`--json` emits the same plan as structured data and implies `--dry-run`.

`--out <file>` persists the preview and also implies `--dry-run`.

## Check Template Health

```bash
repo templates --check
repo templates --check --json
```

The check validates duplicate sources and targets, existing source directories, package metadata, categories, descriptions, and temporary files that would be filtered by the scaffolder.

## Keep Reading

- [Adopt an existing workspace](/tasks/adopt-existing)
- [Add checks to CI](/tasks/ci)
- [Configuration](./config.md)
