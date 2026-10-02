# Command Reference

This page focuses on high-value repoctl commands and options.

## Main Entry

```bash
pnpm exec repo init
pnpm exec repo doctor
pnpm exec repo templates
pnpm exec repo new
pnpm exec repo check
```

Generated repositories also expose:

```bash
pnpm run repo:init
pnpm run repo:doctor
pnpm run repo:new
pnpm run repo:check
```

## `repo init`

```bash
repo init
repo init --yes
repo init --preset minimal
repo init --preset standard --force
repo init --overwrite
```

Use it to initialize recommended workspace defaults. It skips existing managed files by default, appends missing workspace patterns, and supports non-interactive CI usage with `--yes`.

## `repo doctor`

```bash
repo doctor
repo doctor --strict
repo doctor --json --out reports/doctor.json
repo doctor --markdown --redact --out reports/doctor.md
```

Use it to check root workspace files, Node compatibility, CLI dependency presence, `repo:*` root scripts, stale config files, and commit hooks.

`--strict` treats warnings as failures. `--redact` removes local absolute paths from shareable reports.

## `repo templates`

```bash
repo templates
repo templates tsdown
repo templates --category library
repo templates --check
repo templates --json
repo templates --markdown --out docs/templates.md
```

Use it to discover built-in template keys, inspect metadata, verify template health, or generate machine-readable output.

## `repo new`

```bash
repo new
repo new sdk --template tsdown
repo new docs --template nimbus
repo new docs --template nimbus --dry-run
repo new docs --template nimbus --json --out plans/docs.json
```

Use it to create packages and apps. Explicit template keys are validated first; invalid keys fail with suggestions instead of silently falling back.

## `repo package check`

```bash
repo package check
repo package check --filter '@scope/*' --strict
repo package check --filter my-library --keep-temp --json
```

Build the selected workspace packages and their dependencies in dependency order, then validate real `pnpm pack` tarballs with publint 0.3.25 and ATTW 0.18.5. Build failure prevents all packing. Local development prerequisites are included in the build; private prerequisites can build without being packed or checked. Private packages are reported as skipped unless `--include-private` is supplied. Repeat `--filter` to combine pnpm selectors; `--build-script` changes the default `build` script. Packages without that script are treated as already authored artifacts.

Independent temporary consumers install the tarballs and their local runtime dependency tarballs, then exercise declared Node ESM/CJS entrypoints and TypeScript NodeNext consumption. TypeScript consumption uses ATTW's pinned TypeScript 5.6.1-rc. Undeclared module formats are not required. Browser-only and non-JavaScript asset exports receive manifest/type analysis rather than Node execution; JavaScript bins receive syntax checks, without invoking application commands. Installation can contact the registry, while dependency install scripts are disabled. Workspace build and pack lifecycle scripts run normally.

JSON contains each package's file list, stable diagnostic source/code, original upstream details, and subprocess argument arrays. `--strict` also fails on warnings. `--keep-temp` preserves the tarballs, consumer manifests and command working directories for reproduction; otherwise temporary files are removed even after failure. The command never publishes, changes package versions, or writes release state.

To use it as a release gate, add a package script such as `"package:check": "repoctl package check --strict"` and reference `package:check` in `commands.release.hooks.verify`. Do not put this command in a build/prepack script, since it runs those stages itself.

## `repo check`

```bash
repo check
repo check --staged
repo check --full
repo check --edit-file .git/COMMIT_EDITMSG
repo check --dry-run
repo check --json --out reports/check-plan.json
repo check --markdown --redact --out reports/check-plan.md
```

Use it to preview or run the recommended local verification flow. `--staged` is closer to pre-commit; `--full` is closer to pre-push.

## `repo upgrade`

For third-party dependency declarations, use `repo deps check`, create an explicit
read-only plan with `repo deps plan`, then apply reviewed JSON with `repo deps apply`.
See [Dependency consistency](./dependencies.md) for protocols, version groups and recovery.

```bash
repo upgrade
repo upgrade --yes
repo upgrade --overwrite
repo upgrade --no-overwrite
repo upgrade --core
repo upgrade -i
repo upgrade -s
repo upgrade --dry-run
repo upgrade --json > upgrade-plan.json
repo upgrade --markdown
repo upgrade --apply upgrade-plan.json
```

Use it to sync standard assets and scripts. `--core` skips GitHub-related assets. `--no-overwrite` preserves changed files.

`--dry-run`, `--json` and `--markdown` always preview without writes or prompts. Every selected asset has an `add`, `modify`, `delete`, `identical`, `skip` or `conflict` status and a reason. Package scripts/dependencies, workspace settings, AGENTS sections, gitignore rules, tooling references and legacy versioning migration all use the same plan. Text and Markdown show per-file unified diffs; binary files and text larger than 256 KiB combined are explicitly marked without a fabricated diff.

`--apply` applies every actionable entry in a reviewed JSON plan, using its exact bytes. The ordinary command retains interactive overwrite selection; non-interactive execution without `--yes` writes only approved additions. All approvals happen before the first write. `--no-overwrite` and `-s` also preserve legacy metadata. Custom release workflows remain protected unless `--overwrite-release` is explicit; existing licenses are preserved. A prerelease lane migration and its metadata deletion form one indivisible selection group. Unknown prerelease state stays on disk for manual migration.

Plans record the original target, asset and local configuration hashes. Application checks all inputs before any replacement, rejects concurrent edits or a changed workspace package set, and treats a fully applied plan as a no-op. It creates original `.repoctl-upgrade-*.bak` backups before replacing files and rolls back a failed operation. When a concurrent edit prevents rollback, the error identifies retained originals. After a process interruption, inspect those backups, restore originals as needed, remove leftover `.tmp` files and generate a new plan. Unrelated files and Git refs/index are untouched.

Each preview refreshes configuration entries, inherited configs and statically resolved local imports, including literal dynamic imports, in memory. These files join the input checks; module-relative paths remain intact. Installed packages, computed imports, environment variables and arbitrary filesystem/network reads are outside this tracked module set, so regenerate the plan when those runtime inputs change. Executable configuration must itself avoid side effects for a read-only preview.

Preview never generates missing template assets. An `assets-not-prepared` blocker means the package installation must be repaired first; source contributors can run `pnpm --filter @icebreakers/monorepo-templates sync:assets` explicitly. Plans belong to the same working directory, output directory and installed asset location. Public APIs are `planUpgrade(options)`, `formatUpgradePlan(plan, 'text' | 'markdown')`, `applyUpgradePlan(cwd, plan, { files? })` and `upgradeMonorepo({ dryRun: true })`; `UpgradePlan` includes base64 payloads for exact application. `repo workspace upgrade` and `repo ws up` share these options.

## Workspace Dependencies

```bash
repo workspace graph
repo workspace graph --json --redact
repo workspace graph --mermaid
repo workspace graph --package @acme/shared --type dependencies
repo workspace why @acme/web @acme/shared --json
repo workspace impact @acme/shared --direct --json
```

These read-only queries share a manifest dependency graph. Private apps are included by default; `--exclude-private` excludes them and `--include-root` adds the root package. Edges point from a consumer to its dependency. `--type` accepts `dependencies`, `devDependencies`, `peerDependencies`, or `optionalDependencies` and can be repeated. With no type filter, all four fields are included.

`graph --package <name-or-directory>` shows the selected packages and their direct incoming/outgoing relationships; repeat it to select several packages. `why <from> <to>` returns one deterministic shortest dependency path, including both endpoints; no path is a successful query with `found: false`. `impact <package>` returns direct and transitive consumers with minimum distance and one path per consumer. `--direct` limits it to immediate consumers. Cycles are safe and the target itself is excluded from its impact result.

Selectors accept exact package names or workspace-relative directories such as `./packages/shared`. Duplicate names produce diagnostics, and queries using an ambiguous name fail; use an explicit directory to disambiguate. Unnamed packages remain queryable by directory. Missing, ambiguous, invalid, and version-incompatible forced local references are included in `diagnostics` instead of becoming guessed edges.

The graph understands workspace ranges, workspace aliases (`workspace:@acme/shared@^1`), relative workspace paths, and local `link:`/`file:` directories. Every edge records `resolution`: `workspace` and `local` are explicit local references, while `semver` marks a matching local candidate for an ordinary range or `npm:` alias. These are manifest relationships, not proof of what a lockfile installed: registry tags, catalogs, remote URLs and source imports are not resolved. Catalog references and unsupported specifiers with a same-name local candidate produce `unresolved_specifier` diagnostics. Consumers must inspect diagnostics before treating the graph as complete; affected checks can fall back conservatively. Filtering private/root packages can also leave forced references unresolved.

JSON uses schema version `1`, directory-based node IDs and stable sorting; field names and diagnostic codes do not change with `--lang`. Mermaid uses the same nodes and edges, including isolated packages. Queries write only to stdout, so shell redirection can save an export. `--json` and `--mermaid` are mutually exclusive.

Programmatic users can call `getWorkspaceGraph(cwd, options)`, `filterWorkspaceGraph(graph, options)`, `whyWorkspaceDependency(graph, from, to, options)` and `getWorkspaceImpact(graph, package, options)`. Discovery refreshes its cache for each graph read. Query APIs accept the same public graph model without exposing pnpm implementation types.

## Grouped Commands

```bash
repo ws ls
repo ws ls --json --out reports/workspaces.json
repo ws up
repo tg init --all
repo verify pre-commit
repo verify pre-push
repo env support --markdown --redact --out reports/support.md
repo config inspect
repo skills sync --codex
```

## Keep Reading

- [Add checks to CI](/tasks/ci)
- [Troubleshoot](/tasks/troubleshooting)
- [Command Aliases](./aliases.md)

## `repo tooling references`

`check --json` checks existing references without opt-in. `plan` and `sync --dry-run` preview deterministic JSON without writes. With `tooling.projectReferences.enabled: true`, use `sync` or `apply <plan.json>` to maintain only registered references. Existing manual references and TypeScript/Vue validation scripts are preserved; incompatible compiler options, cycles, missing targets and stale plans block application. See [configuration](./config#typescript-project-references) for discovery, explicit compilation relationships, ownership and recovery.
