# Templates

Prefer `repo new [name]` for the guided flow. For agents, pass `--template`
explicitly so the command does not prompt.

Intent defaults:

- library -> `tsdown` -> `packages/<name>`
- web-app -> `vue-hono` -> `apps/<name>`
- api-service -> `hono-server` -> `apps/<name>`
- docs-site -> `nimbus` -> `apps/<name>`
- cli-tool -> `cli` -> `apps/<name>`

Run `repo templates` to discover template keys, categories, default targets, and
descriptions. Use `repo templates <key>` for a single template detail page, and
`repo templates --json` when scripting. Use `repo templates --check` to verify
template metadata, directories, package.json files, duplicate targets, and
temporary files; combine it with `--json` for CI. Use `repo templates --markdown`
or `repo templates <key> --markdown` when generating documentation snippets.
Add `--out <file>` to write the selected output to disk.

Use `repo new <name> --template <key> --dry-run` to preview the target directory
and package metadata without writing files. Use `repo new <name> --template <key>
--json` when a script needs the same create plan as structured data; `--json`
implies `--dry-run`. Add `--out <file>` to write either preview format to disk.

Explicit template keys are validated before any files are written. If a key is
misspelled, the CLI fails and prints the closest known key when one is available.

Advanced users can still use `repo package create [path]` or `repo pkg new [path]`
to select templates directly.

Built-in template map:

- tsdown -> templates/tsdown => packages/tsdown
- vue-lib -> templates/vue-lib => packages/vue-lib
- hono-server -> templates/server => apps/server
- vue-hono -> templates/client => apps/client
- nimbus -> templates/nimbus => apps/docs (default documentation template)
- vitepress -> templates/vitepress => apps/website (explicit alternative)
- cli -> templates/cli => apps/cli

Notes:

- The command prompts for template selection unless defaults are set in
  repoctl.config.ts or monorepo.config.ts.
- Override mappings with `commands.create.templateMap` and `commands.create.templatesDir`.

## Custom catalog

Creation, list/detail, interactive choices and `repo templates --check` share `resolveTemplateCatalog({ cwd })`. Object entries in `commands.create.templateMap` accept `source`, `target`, optional `label`, `description`, and `category` (`app`, `docs`, `library`, `service`, `tool`); string entries still map the same source and target. Absolute sources coexist with installed templates. `templatesDir` replaces the root for all relative sources, including built-ins, and is relative to the configuration file, including when invoked in a nested workspace package. A non-empty `choices` array preserves explicit ordering/inclusion and supplies the same labels/descriptions shown by discovery.

Detail/JSON include `origin`, `overridesBuiltin`, `sourceDir`, `configFile` and `configPath`; create JSON includes `templateInfo`. Health checks report invalid declarations, duplicate choices, sources and targets, missing directories/manifests and metadata. Checks are read-only and do not execute template code. Prefer `--check --json` for diagnostic locations; listing JSON keeps the array shape.

## Author validation

Use `repo templates validate <key> --fixture <workspace-skeleton> --json` for explicit generated-project validation. `--dry-run` inspects required scripts without executing them; repeated `--name` validates renamed samples. `--parameter-matrix matrix.json` reads a JSON array of typed parameter objects and crosses it with names (at most 20 samples). The public helper uses `parameterSets`. Each combination inspects its rendered files and conditional scripts before execution. Sensitive values are redacted, and sensitive combinations hide child output and diagnostic messages while retaining stages, exit codes and diagnostic codes; retained generated files can still contain those inputs. Execution order is install → build → lint/Stylelint → typecheck → tsd for typed libraries → built-artifact tests and declared E2E. Library samples additionally pack, analyze and consume actual tarballs. Default cleanup removes samples; `--keep-failed` retains failure diagnostics and `--keep-temp` retains every sample. `--timeout` bounds each child command, and interruption stops only the validation process tree. Ordinary template discovery/check never executes scripts.

## Remote assets

A custom entry can add `remote: { kind: 'npm', packageName, version, registry? }` or `remote: { kind: 'git', repository, ref }`; `source` is a relative archive directory, including `.` for its root. npm requires an exact version; prefer a full Git commit for reproducibility across fresh caches. `repo templates fetch <key> --json` prepares verified assets. Actual creation/validation may fetch, while listing, health and previews remain read-only and need a previously fetched cache. `--offline` refuses a miss; `--cache-dir` or `commands.create.cacheDir` overrides the cache relative to invocation cwd.

npm configuration supplies scoped registry/authentication. Never put credentials in the remote declaration. Fetching runs no lifecycle scripts, hooks, submodules or dependency installs. Cache hits recheck original archives against extracted asset contents; corruption is an error, not an automatic refresh. A Git ref stays pinned to its first cached commit. Instances record resolved provenance and retained baselines; remote upgrades are explicitly unsupported by the built-in-version `templates upgrade` command. The exported `resolveRemoteTemplateSource` helper is the same acquisition boundary used by the CLI.

## Existing-package generators

Use `repo generate <vue-component|react-component|hono-route> <kebab-name> --package <exact-name-or-relative-dir> --json` to inspect source and behavior-test files before writing. Run without `--json` to apply; `--export` explicitly adds a named export to `src/index.ts` (or `--barrel`). `--directory` stays inside the selected package. Strict parameters, framework requirements, stale plans, symlinks and conflicting files fail before writes. Repeated identical generation is unchanged. Hono route registration remains an explicit printed next step. Validate generated output with build, ESLint/Stylelint, tsc/vue-tsc and tests. Keep `repo new` for whole new packages; it never overwrites existing directories.
