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
