# Templates

repoctl templates are maintained by `@icebreakers/monorepo-templates`. The CLI, scaffolder, and docs share the same template metadata.

## Built-In Templates

| Key           | Category | Default target       | Use case                                           |
| ------------- | -------- | -------------------- | -------------------------------------------------- |
| `tsdown`      | library  | `packages/tsdown`    | TypeScript library                                 |
| `vue-lib`     | library  | `packages/vue-lib`   | Vue 3 component library                            |
| `vue-hono`    | app      | `apps/client`        | Vue 3 + Hono app                                   |
| `react-vite`  | app      | `apps/react-vite`    | React + Vite + TypeScript SPA                      |
| `react-lib`   | library  | `packages/react-lib` | React component library with types and CSS exports |
| `hono-server` | service  | `apps/server`        | Hono API service                                   |
| `vitepress`   | docs     | `apps/website`       | VitePress docs site                                |
| `nimbus`      | docs     | `apps/docs`          | Nimbus + Astro, default bilingual docs             |
| `cli`         | tool     | `apps/cli`           | TypeScript CLI                                     |

Nimbus is the default for the interactive **Docs Site** goal. It includes English at `/`, Chinese at `/zh/`, search and AI documentation endpoints. VitePress remains an explicit alternative. Their default targets are `apps/docs` and `apps/website`, so both can coexist. General creation still defaults to `tsdown`; naming a project `docs` does not infer its template. In noninteractive workflows, pass `--template nimbus` explicitly.

## Discover Templates

```bash
repo templates
repo templates tsdown
repo templates --category library
repo templates --json
repo templates --markdown --out docs/templates.md
```

## Discover Custom Templates

Define local templates in `commands.create.templateMap`. Creation, interactive choices, list/detail output and health checks resolve the same catalog, including key, label, description, category, source directory and default target.

```ts
import { fileURLToPath } from 'node:url'
import { defineMonorepoConfig } from 'repoctl'

export default defineMonorepoConfig({
  commands: {
    create: {
      templateMap: {
        'internal-service': {
          source: fileURLToPath(new URL('./templates/internal-service', import.meta.url)),
          target: 'apps/internal-service',
          label: 'Internal service',
          category: 'service',
          description: 'Company API service',
        },
      },
    },
  },
})
```

```bash
repo templates internal-service --json
repo templates --check --json
repo new payments --template internal-service --dry-run
```

Absolute `source` paths allow installed and local templates to coexist. A relative `source` is resolved under `templatesDir`; that directory defaults to the installed template package. Setting `templatesDir: './templates'` replaces the root for every template, including built-ins, and resolves relative to the configuration file directory. Running from a nested pnpm workspace package finds the root configuration without shifting the template root. Generation destinations remain relative to the invocation directory.

String mappings remain supported: `templateMap: { custom: 'custom' }` is equivalent to `{ source: 'custom', target: 'custom' }`. Optional `label`, `description` and `category` add discoverable metadata. A non-empty `choices` array controls interactive order and inclusion; its names and descriptions also appear in list/detail output. Without it, all catalog entries are available. Existing built-in intent defaults are retained; configuring custom templates opens the catalog picker.

Overriding a built-in key is visible through `origin: 'custom'`, `overridesBuiltin: true` and its `configFile`/`configPath`. Invalid definitions and duplicate choices identify their configuration location. `repo templates --check` also detects duplicate sources/targets, missing source directories and missing `package.json`. List JSON remains an array; detail JSON remains an object, with additive catalog fields. Create JSON includes the selected entry as `templateInfo`.

Listing and health checks read declarations and files without generating output or executing template code. `--out` explicitly writes the chosen report. Programmatic consumers can use `resolveTemplateCatalog({ cwd })` and `checkTemplates({ cwd })`.

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

## React component library

```bash
pnpm create repoctl@latest my-workspace -- --yes --templates react-lib
# Or add a library to an existing workspace:
repo new ui --template react-lib
```

`react-lib` provides an ESM-only React 19.3+ library in `packages/react-lib`.
Import `Counter` and `CounterProps` from the package root and import
`your-package-name/style.css` once in the consumer application. React/React DOM
and JSX runtimes remain peer dependencies; CSS is marked as a side effect.
The library has build, ESLint/Stylelint, TypeScript, tsd and built-component tests.

Generated packages remain private by default. Set your package name and version,
remove `private` or set it to `false`, then run `repo package check` before
publishing. The source workspace's `pnpm test:packaged-react-lib` verifies both
creation flows and installs an actual tarball in a separate Vite application,
checking public types, production styling, pointer/keyboard interaction and a
single shared React instance. The bundled client boundary is also exercised by a
Next App Router Server Component importing the tarball, followed by production
browser hydration and interaction. Storybook is optional.

## Validate a template as its author

`repo templates validate <key>` is an explicit execution command. It resolves the same built-in/custom catalog, creates a disposable workspace outside the author repository, installs its declared pnpm version through Corepack, then runs build → lint → typecheck (TypeScript/Vue) → tsd (typed libraries) → test → test:e2e (when declared). Missing required scripts fail before installation. Style files require Stylelint in `lint`, or a separate `lint:styles` script.

```bash
repo templates validate internal --fixture ./fixtures/workspace --name basic --name renamed --json
repo templates validate react-lib --dry-run --json
repo templates validate internal --fixture ./fixtures/workspace --keep-failed --timeout 240000
```

The optional fixture is an author-owned workspace skeleton with `package.json`, an exact `packageManager: "pnpm@..."`, workspace settings, and any companion packages. It is copied through normal template filtering; it is never modified. Without a fixture, the installed repoctl workspace assets supply the root. Each name receives its own workspace. Names currently test package renaming; arbitrary template feature parameters are not supported yet.

Library validation removes `private` only from its disposable copy, packs a tarball, checks exports and declared runtime dependencies (including `imports` mappings), then installs and imports the tarball in an independent consumer. Type declarations are checked with strict NodeNext resolution. Application/service/browser behavior belongs in the template's finite `test`/`test:e2e` scripts; those scripts own their normal service lifecycle, with timeout/interruption cleanup as a backstop. Browser installation is an explicit author setup step.

Commands and output are returned with stable stages and diagnostic codes. Successful and failed samples are removed by default; `--keep-failed` preserves failed samples with `report.json`, and `--keep-temp` preserves all samples. The report includes the retained directory. Execution never happens during `repo templates` or `--check`. Validation executes trusted author scripts; it is not an untrusted-code sandbox.

The same contract is public API:

```ts
import { planTemplateValidation, validateTemplate } from 'repoctl'

const options = { cwd: process.cwd(), template: 'internal', fixtureDir: './fixtures/workspace' }
const controller = new AbortController()
const plan = await planTemplateValidation(options)
const report = await validateTemplate({ ...options, keep: 'failure', signal: controller.signal })
```
