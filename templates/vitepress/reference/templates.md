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

## Instance origins and historical association

Successful `repo new` and `create-repoctl` runs register each generated instance in `.repoctl/template-instances.json`. Keep this file and `.repoctl/template-baselines/` in version control. Records contain the stable template key, actual template package version, source digest, generation profile, and only the supported `packageName` / `renameJson` inputs. Local custom sources use immutable content digests without claiming a published upstream version. Root managed assets have separate ownership and are not registered as project instances.

```sh
repo templates instances --json
repo templates instances packages/shared-utils --json
```

An available baseline has two layers: the original delivered template and the output after repoctl transformations. Content-addressed snapshots preserve file bytes, executable flags, and empty directories, permitting offline reconstruction even after the old package is unavailable. Generated caches and dependencies are excluded using the template copy rules. Snapshots are template data, not executable migration scripts. Git metadata is captured only as part of a newly generated output; historical linking does not infer old Git identity from the current machine.

For an existing project, select its historical template package version explicitly. `--source-dir` is an already extracted `@icebreakers/monorepo-templates` package directory, including its `package.json` and `templates/` directory. The package name and exact version are checked; no historical JavaScript or lifecycle scripts run, and links escaping the package are rejected. The installed package is usable when its exact version matches; retained baselines also support repeated offline associations.

```sh
repo templates link packages/shared-utils --template tsdown --source-version 2.1.0 --source-dir ../historical-templates --package-name shared-utils --json
# After inspecting the added, modified and deleted paths:
repo templates link packages/shared-utils --template tsdown --source-version 2.1.0 --source-dir ../historical-templates --package-name shared-utils --apply --json
```

The default `repo-new-v1` profile rewrites package name/version and workspace-relative configuration. Use `--rename-json` for historical `package.mock.json` output. Projects originally copied by `create-repoctl` use `--profile workspace-copy-v1`, which preserves template package names and does not accept rewrite parameters. Linking saves metadata and template-derived snapshots only; business files are never used as the historical baseline or rewritten.

If the exact source cannot be recovered, the preview reports `unverified` and explains that reliable upgrades and upstream comparison are unavailable. `--unverified --apply` explicitly records that limitation. Floating tags such as `latest`, version ranges, conflicting registrations, and stale API plans are rejected. Querying and previewing do not create a registry. Repeated identical association preserves existing metadata without meaningless diffs. An unverified association can later be explicitly linked again with its exact source; the preview reports `verify` and shows differences before the baseline is recorded.

```sh
repo templates rebuild-baseline packages/shared-utils --destination ../isolated-rendered-baseline
repo templates rebuild-baseline packages/shared-utils --destination ../isolated-original-template --original
```

The destination must not exist. Missing or corrupted retained snapshots are reported as `unavailable`, never as healthy. Deleted or renamed instance paths appear as `missing`; creation refuses to reuse their registered paths. `repo templates relocate <instance-id> <new-relative-path>` previews an explicit path association; `--apply` updates metadata only after the old path is missing and the destination exactly matches the retained rendered baseline. A changed destination cannot be automatically proven to be the same instance and is rejected.

Metadata writes use a lock and atomic registry replacement. Failed registration never reports completed creation; generated files remain at the concrete recovery path in the error so they can be inspected and explicitly associated. A stale lock identifies its path: confirm that its writer has stopped before removing it. Failed metadata commits remove their temporary snapshots and leave the prior registry intact.

## Upgrade one template instance

Select an instance by its registered ID or target path, and request an exact target package version. Preview is read-only; `--apply` is required to change files. `--source-dir` reads an extracted package as data and runs no package scripts. Without it, the installed template package must match the requested version. The historical source is reconstructed from retained snapshots, so the old package need not remain installed.

```sh
repo templates upgrade packages/shared-utils --source-version 2.2.0 --source-dir ../templates-2.2.0 --json
repo templates upgrade packages/shared-utils --source-version 2.2.0 --source-dir ../templates-2.2.0 --apply --json
```

The plan compares the old rendered baseline, current instance, and newly rendered template. Template-only edits are adopted, business-only edits are retained, and non-overlapping text edits are merged. The original generated package name and Git metadata are preserved. After success, the retained baseline advances to the new template output, keeping business customizations out of the upstream baseline. Repeating the same version uses retained snapshots offline and makes no further changes; changing source content under an existing version is rejected.

Overlapping text edits, binary conflicts, addition collisions and file/directory replacements block the whole instance. The preview includes conflict paths and text regions; it never inserts conflict markers into business files. Resolve the relevant local edits and preview again, or explicitly transfer those paths to business ownership. Text merges preserve BOMs, CRLF and final-newline behavior; conflicting files whose combined three inputs exceed 1 MiB require manual resolution. POSIX executable flags are applied where supported; Windows retains its native read-only permissions without synthesizing executable bits.

```sh
repo templates upgrade packages/shared-utils --source-version 2.2.0 --source-dir ../templates-2.2.0 --exclude README.md src/custom --json
# Apply the same selection after review:
repo templates upgrade packages/shared-utils --source-version 2.2.0 --source-dir ../templates-2.2.0 --exclude README.md src/custom --apply --json
```

Exclusions are paths relative to the instance and persist in its registry record. A directory excludes all descendants; `src/custom/**` is accepted as the same directory selection. Arbitrary globs and escaping paths are rejected. Excluded contents are not read or included in the upgrade plan. Other business-only files and directories are outside the candidate scan, including large files and unrelated links. Exclusions accumulate across upgrades; there is no automatic re-enrollment command.

User-deleted files and directories stay deleted, including new upstream descendants of a deleted directory. Upstream-deleted files are removed only when locally unchanged. A locally edited removal is a conflict. Removed directories are retained conservatively, because they can contain unmanaged business files or caches. Missing or unverified historical baselines stop the upgrade. Root managed assets, root dependency policy and other registered instances are outside this operation; dependency changes inside the selected instance's template manifest are treated as ordinary file changes.

### Recover an interrupted upgrade

Before mutation, repoctl writes `.repoctl/template-upgrades/<instance-id>.json` with the selected operation's file states and registry metadata. File changes and metadata replacement share the instance-registry lock. Ordinary failures restore this operation before releasing the lock. A concurrent business edit is retained, and an incomplete recovery record blocks another upgrade.

```sh
repo templates recover-upgrade packages/shared-utils --json
repo templates recover-upgrade packages/shared-utils --apply --json
```

Recovery preview is read-only. Applying recovery restores recorded files and the previous source version only when each affected path still matches either its before or after state; conflicting business edits must be preserved and resolved first. It does not replay the failed upgrade. A process crash can leave `.repoctl/template-instances.lock`; verify its recorded process has stopped before removing that lock and applying recovery. A failure to clean up after metadata commit explicitly reports that the upgrade was applied; recovery still rolls that recorded operation back.

Recovery records contain local before/after content only for files changed by that upgrade, and are removed on successful completion or recovery. Treat them as local backups and exclude `.repoctl/template-upgrades/` from version control. Keep the registry and template baselines tracked. JSON previews also contain template-managed candidate contents and should be handled accordingly. `--out <file>` explicitly writes a report even in preview mode.

## Diagnose versions and managed file drift

```sh
repo templates drift --json
repo templates drift --source-dir ../templates-2.2.0 --markdown --out reports/template-drift.md
repo templates drift --remote --strict
repo doctor --rules template-instance-baseline,template-instance-version,template-instance-drift,root-asset-drift --strict
```

Drift diagnosis is read-only. It does not update source versions, snapshots, registry entries or business files. `--out` writes only the requested report. Reports contain paths and content hashes, without business file bodies.

The default comparison uses the actual installed template package metadata and performs no network request. `--source-dir` selects metadata from an extracted package, without executing its scripts. `--remote` explicitly queries the public npm registry's `latest` dist-tag, with a timeout; it cannot be combined with `--source-dir`. A failed, malformed or mismatched response remains unavailable. A local `same` result means only that the compared versions match, not that the package is remotely latest. A `newer` result identifies a newer package version, not a claim that every individual template changed. Custom snapshot sources remain unversioned with an `unknown` version comparison.

Each instance or root asset reports baseline validity, version comparison (`newer`, `same`, `ahead`, `unknown`) and local drift independently. Only paths in retained trustworthy baselines are inspected. Business additions are outside ownership; user deletions appear as `deleted`, and persistent upgrade exclusions appear as `excluded` without reading their content. Unsafe or unreadable paths remain `unavailable`. Root assets enter comparison only through validated records in `.repoctl/baselines/root/`; absent registries mean unregistered, not verified healthy.

Local modifications, deletions, newer known versions and missing evidence are warnings by default. `--strict` fails when any warning remains effective. The doctor rules are `template-version-evidence`, `template-instance-registry`, `template-instance-baseline`, `template-instance-version`, `template-instance-drift`, `root-asset-registry`, `root-asset-version` and `root-asset-drift`.

Reuse `commands.doctor.suppressions` for reasoned decisions. An exact workspace-relative path scopes a decision to one finding; omission covers that rule across instances. Active suppressions affect effective counts and strict exits, while raw findings, reasons, expired entries and unmatched entries remain visible. Suppression does not transfer file ownership; use instance upgrade exclusions when a file should leave template management.

```ts
export default {
  commands: {
    doctor: {
      suppressions: [{
        id: 'template-instance-drift',
        path: 'packages/shared-utils/README.md',
        reason: 'The team maintains this documentation separately',
        expires: '2027-01-31',
      }],
    },
  },
}
```

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

## Fixed npm and Git sources

Custom entries can use an exact npm package version or an explicit Git ref while keeping `source` as the relative template directory inside that archive. Use `source: '.'` when the archive root is the template. `templatesDir` applies only to local sources.

```ts
export default defineMonorepoConfig({
  commands: {
    create: {
      cacheDir: './.cache/template-assets',
      templateMap: {
        team: {
          source: 'templates/library',
          target: 'packages/team',
          category: 'library',
          remote: { kind: 'npm', packageName: '@acme/templates', version: '1.2.3' },
        },
        service: {
          source: 'templates/service',
          target: 'apps/service',
          remote: { kind: 'git', repository: 'https://github.com/acme/templates.git', ref: 'v1.2.3' },
        },
      },
    },
  },
})
```

```sh
repo templates fetch team --json
repo new sdk --template team --dry-run
repo new sdk --template team --offline
repo templates validate team --fixture ./fixtures/workspace --offline --json
```

`repo templates fetch <key>` acquires and verifies assets without creating a project. Actual creation and author validation can also fetch a missing source. Discovery, health checks, creation previews and validation previews are read-only: fetch the exact source first. `--offline` refuses a cache miss. `--cache-dir` on fetch/new/package-create/validate and `commands.create.cacheDir` select a cache directory relative to the invocation directory. The default is `$XDG_CACHE_HOME/repoctl/template-sources-v1`, or `~/.cache/repoctl/template-sources-v1`.

npm versions must be exact; tags and ranges are rejected. The effective registry comes from the optional `remote.registry`, scoped npm settings or the default registry. Existing `.npmrc` authentication is honored in memory; tokens do not enter plans, cache manifests or instance provenance. Git accepts HTTPS, SSH and file URLs with an explicit ref. Use credential helpers or an SSH agent rather than credentials in URLs. Remote package scripts, Git hooks, submodules and dependency installation never run during fetching.

The first Git fetch records its resolved commit. That same request continues using the verified cached commit even if a branch or tag moves. Pin a full commit hash for reproducibility across fresh caches. To deliberately resolve a moved ref, choose a new cache directory or remove the identified cache entry after confirming no writer is active. Corrupt entries fail explicitly and are never silently trusted or refreshed. Archives are bounded and checked before extraction; traversal, links, special files and portable-path collisions are rejected.

Creation records npm version/integrity or Git commit/integrity with its retained baseline. Remote instances support baseline reconstruction and drift inspection. `templates upgrade` currently accepts built-in template-package versions and rejects remote instances explicitly; changing a remote declaration does not upgrade existing generated projects.

The public `resolveRemoteTemplateSource(remote, source, { cwd, cacheDir, offline })` helper returns verified `sourceDir`, normalized `request`, fixed `resolved` identity, asset `digest`, and `cache: 'hit' | 'downloaded'`.

## Generate inside an existing package

Use `generate` for a component or route inside a selected workspace package:

```sh
repo generate react-component action-button --package @acme/ui --json
repo generate react-component action-button --package @acme/ui --export
repo generate vue-component action-button --package packages/vue-ui --export
repo generate hono-route health --package apps/api
```

The built-in generators are `vue-component`, `react-component`, and `hono-route`.
They require the target package to declare Vue, React, or Hono respectively. Every
generator creates a source file and meaningful Vitest tests. Names use kebab case;
`--directory` changes the package-relative source directory. Component defaults
are `src/components`, route defaults are `src/routes`, and tests live under `test`.

`--json` and `--dry-run` are read-only previews. `--export` explicitly adds a named
export to `src/index.ts`, or the `.ts` file selected by `--barrel`. Existing comments
are retained. Ambiguous wildcard exports or conflicting symbols require manual
review. JSON `--params '{"export":true}'` uses the same strict parameter contract;
unknown parameters and string booleans fail before any write.

Identical generated files are unchanged on repeat runs. Modified files, linked
paths, outputs outside the package, and stale plans are rejected. Multi-file writes
hold a package operation lock and restore previous contents on failure; concurrent
business edits and recovery backups are retained with explicit recovery paths.

Hono generators return an isolated sub-router. Follow the printed `app.route(...)`
instruction after reviewing your entry point, mount path and middleware order.
The generator does not guess where to register it. Install missing test utilities
and configure a compatible Vitest environment when prompted; dependencies and
application configuration are not changed automatically. Run build, lint,
Stylelint for SFC styles, typecheck, and tests after generation.

`new` continues to create a whole package and rejects existing target directories.
The public API exposes `planGenerate(options)` and `applyGeneratePlan(plan)`; both
operate on the same validated file plan.

## Typed parameters and conditional generation

Place `repoctl.template.json` at the template root to declare typed inputs and conditional files, scripts and dependency entries. Conditions compare declared values without executing code.

```json
{
  "schemaVersion": 1,
  "parameters": {
    "label": { "type": "string", "default": "demo" },
    "tests": { "type": "boolean", "default": false },
    "flavor": { "type": "enum", "options": ["plain", "bold"], "default": "plain" },
    "token": { "type": "string", "required": true, "sensitive": true }
  },
  "interpolate": ["src/settings.ts", "credentials.local"],
  "conditions": [{
    "when": { "parameter": "tests", "equals": true },
    "files": ["test"],
    "package": {
      "scripts": { "test": "vitest run" },
      "devDependencies": { "vitest": "catalog:" }
    }
  }]
}
```

Paths are exact template-relative paths; directory conditions include descendants. Globs, filename interpolation and path traversal are rejected. Only declared UTF-8 text expands <code v-pre>{{repoctl:label}}</code> (raw text) or <code v-pre>{{repoctl-json:label}}</code> (a JSON literal); binary bytes remain unchanged. Engineering references are rewritten before inserting input values. Choose placeholders appropriate for the destination syntax: raw values are not automatically escaped as code or HTML. The contract is omitted from generated projects.

Conditional package entries must have one owner and be absent from the base manifest. Supported sections are scripts, dependencies, devDependencies, peerDependencies and optionalDependencies. Catalog references require a matching workspace catalog. Sensitive parameters cannot drive conditions or enter package entries.

```sh
repo new api --template team --data ./answers.json --json
repo new api --template team --data ./answers.json
repo package create api --template team --data ./answers.json
```

The data file is a UTF-8 JSON object up to 1 MiB. Unknown keys, invalid types/enums and missing required inputs fail before writes without echoing input values. Booleans are not coerced from strings. Interactive terminals prompt for omitted values and mask sensitive strings; JSON and noninteractive callers never prompt. Both input paths use the same validation. Templates without a contract keep their existing output and reject extra parameters.

The optional preview `parameterization` field reports redacted values and selected files/package entries. Sensitive values remain in memory for rendering; reports, retained parameters and baselines never contain them. Files containing sensitive values become persistent unmanaged exclusions and cannot be restored from baselines. Upgrades retain those local files and reuse nonsensitive inputs. New secret interpolation paths require explicit exclusion before other files can upgrade.

Historical linking through the API accepts parameter values only with `repo-new-parameters-v1` and an available exact source contract. It validates and retains nonsensitive defaults, rejects supplied sensitive values before producing a plan, and cannot create an unverified parameterized registration. Secret output files cannot be reconstructed by supplying their values to the link API.

Use `resolveCreateNewProjectPlan({ parameters, parameterPrompt? })` and `applyCreateNewProjectPlan(plan)` for programmatic planning and execution. Apply accepts the original unchanged in-memory object; serialized reports require a fresh plan with the original data. Changed sources/plans and existing targets fail before writes. Parameterized creation stages output and commits files, workspace configuration and provenance together. Failures restore owned files; concurrent edits or replacements are preserved with recovery locations. Repeating creation never overwrites an existing project.

Moving a parameterized instance retains its identity, inputs and sensitive-file exclusions. Creating the same template again at the freed original path allocates a separate identity; both instances can be diagnosed and upgraded independently. A failed registration rolls back only the new creation.
