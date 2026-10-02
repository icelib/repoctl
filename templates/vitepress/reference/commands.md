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

```bash
repo upgrade
repo upgrade --yes
repo upgrade --overwrite
repo upgrade --no-overwrite
repo upgrade --core
repo upgrade -i
repo upgrade -s
```

Use it to sync standard assets and scripts. `--core` skips GitHub-related assets. `--no-overwrite` preserves changed files.

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
