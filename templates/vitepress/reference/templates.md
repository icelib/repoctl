# Templates

repoctl templates are maintained by `@icebreakers/monorepo-templates`. The CLI, scaffolder, and docs share the same template metadata.

## Built-In Templates

| Key           | Category | Default target     | Use case                               |
| ------------- | -------- | ------------------ | -------------------------------------- |
| `tsdown`      | library  | `packages/tsdown`  | TypeScript library                     |
| `vue-lib`     | library  | `packages/vue-lib` | Vue 3 component library                |
| `vue-hono`    | app      | `apps/client`      | Vue 3 + Hono app                       |
| `react-vite`  | app      | `apps/react-vite`  | React + Vite + TypeScript SPA          |
| `hono-server` | service  | `apps/server`      | Hono API service                       |
| `vitepress`   | docs     | `apps/website`     | VitePress docs site                    |
| `nimbus`      | docs     | `apps/docs`        | Nimbus + Astro, default bilingual docs |
| `cli`         | tool     | `apps/cli`         | TypeScript CLI                         |

Nimbus is the default for the interactive **Docs Site** goal. It includes English at `/`, Chinese at `/zh/`, search and AI documentation endpoints. VitePress remains an explicit alternative. Their default targets are `apps/docs` and `apps/website`, so both can coexist. General creation still defaults to `tsdown`; naming a project `docs` does not infer its template. In noninteractive workflows, pass `--template nimbus` explicitly.

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
repo new docs --template nimbus
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
repo new dashboard --template react-vite
repo new api --template hono-server
```

Check first:

- Runtime environment variables and deployment constraints.
- `dev`, `build`, and `typecheck` scripts are part of root tasks.
- CI needs integration or E2E tests.

### React application

```bash
pnpm create repoctl@latest my-workspace -- --yes --templates react-vite,tsdown
cd my-workspace
corepack enable
pnpm install
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm --dir apps/react-vite preview
```

For an existing workspace, run `repo new dashboard --template react-vite`. The interactive **Web App** goal also offers React + Vite alongside Vue + Hono. Creation refuses an existing target directory; use `--dry-run` to inspect the plan first.

The template includes a keyboard-accessible counter, React Testing Library with Vitest, shared ESLint/Stylelint helpers, and TypeScript project references. It does not choose a router, state manager, backend, or CSS framework. Add a local library as a `workspace:*` dependency, import its package name, and let root `pnpm build` build its exported `dist` output before the app. Do not import library source paths. `preview` serves the production build, not the development server.

### Cloudflare Worker types

The `vue-hono` and `hono-server` templates generate `worker-configuration.d.ts` from the installed Wrangler version and `wrangler.jsonc` before `dev`, `build`, and `typecheck`. This generated file is ignored by Git and excluded from published templates. Dependency updates do not require committing regenerated declarations.

Run `pnpm cf-typegen` in the app workspace to refresh editor types after changing bindings or compatibility settings. `pnpm cf-typegen:check` is a read-only diagnostic: it reports missing or outdated declarations. Build and typecheck regenerate them automatically and still fail on invalid configuration or TypeScript errors.

For existing projects, update these scripts and the Turbo inputs/outputs, then remove `worker-configuration.d.ts` from the Git index with `git rm --cached worker-configuration.d.ts` and add it to `.gitignore`.

### Create a docs site

```bash
repo new docs --template nimbus
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
