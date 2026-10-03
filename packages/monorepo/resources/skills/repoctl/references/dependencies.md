# Dependency consistency

Use `repo deps check --json` to inventory root/private/workspace dependency declarations by name, dependency section and configured cohort. Reports distinguish identical, equivalent, compatible, conflicting, uncomparable, managed and exception groups with exact file locations. Catalog references are resolved for comparison; workspace references and unknown protocols remain report-only. npm aliases retain their actual source package. Peer and development declarations are independent.

Create a read-only preview with `repo deps plan <dependency> --section <section> --to <specifier> --json`. `deps fix` aliases `deps plan`; neither writes manifests. The target is explicit and must overlap the entire compatible cohort. No registry queries or automatic major upgrades occur. Save and review JSON, then use `repo deps apply <plan.json>`. pnpm lockfile updates and installation are explicit user steps: `pnpm install --lockfile-only`, then `pnpm install --frozen-lockfile`.

Configure `commands.deps.groups` at the workspace root. Each group has a unique `name`, exact workspace-relative `workspaces`, exact `dependencies`, a nonempty `reason`, optional `sections`, and optional `ignore: true` for report-only exceptions. Unmatched declarations use `default`; ambiguous overlapping selectors fail. Choose a cohort with `--group`.

Plans carry before/after specifiers and input/file hashes. Applying re-discovers the workspace, verifies every input, reconstructs the planned changes and rejects stale or modified plans before replacement. Repeated applications are no-ops. Multi-file replacements retain backups until completion and roll back failures. On interrupted or failed recovery, inspect the reported `.repoctl-deps-*.bak` backups before generating another plan. Do not overwrite unrelated concurrent edits.

Public APIs: `checkDependencies`, `planDependencyFix`, `applyDependencyFixPlan` from `repoctl`. JSON schema/status keys remain independent of locale.

## pnpm catalog inspection and migration

```bash
pnpm exec repo deps catalog check --json
pnpm exec repo deps catalog check --catalog legacy --json
pnpm exec repo deps catalog plan typescript --section devDependencies --json > catalog-plan.json
pnpm exec repo deps catalog plan react --section dependencies --group react18 --catalog react18 --to '^18.3.0' --json
pnpm exec repo deps catalog apply catalog-plan.json --json
pnpm install --lockfile-only
pnpm install --frozen-lockfile
```

`catalog check` inspects every default and named catalog, root/private workspace consumer, missing catalog or entry, and unused entry. `catalog:` and `catalog:default` are equivalent. The default catalog may live at `catalog` or `catalogs.default`; declaring both is a pnpm configuration error. `--catalog` chooses the policy used to report direct-version bypasses and migration candidates; reference integrity is always checked across all catalogs. Direct peer ranges and explicit ignored version groups are exempt from bypass findings.

The versioned JSON includes exact manifest paths, dependency sections, package names, original specifiers, catalog entries, consumers and stable finding codes. `missing_catalog`, `missing_entry` and `direct_declaration` make check exit with code 1. `unused_entry` and `uncomparable_entry` are informational; an unused entry is never automatically deleted. Simple `overrides` consumers, including version-qualified package selectors, are counted. Nested override selectors are reported as `unresolved_selector`, with possibly referenced entries marked `usage_unknown` instead of claiming they are unused.

Migration reuses dependency consistency cohorts from `commands.deps.groups`; sections remain separate. Identical or semver-equivalent declarations can propose one entry automatically. Compatible but different ranges return `needs_target`: provide `--to` with a range that is a **subset of every selected declaration**, so migration cannot widen allowed versions or introduce a major upgrade. Mutually incompatible versions require explicit cohorts and separate named catalogs, or no migration. No registry is queried and no newest version is chosen.

Only plain semver ranges and same-source npm aliases can migrate. An alias keeps its complete `npm:source@range` in the catalog. Workspace/file/link/Git/URL/tag and unknown declarations stay unchanged. Direct `peerDependencies` are report-only and cannot be migrated by this command. Existing catalog references are preserved; a cohort mixing references to other catalogs requires explicit grouping. Existing entries are never overwritten, including when `--to` differs: choose a new named catalog or separately review an entry change affecting all its consumers.

`catalog plan` is always read-only, with or without `--dry-run`. Its JSON contains complete before/after YAML and consumer-manifest contents, file hashes, every discovered input hash and the normalized selection. Review the linked changes before `catalog apply`. YAML AST editing preserves unrelated configuration and comments; an edited catalog mapping shared through YAML anchors/aliases is rejected rather than changing unrelated alias consumers. Existing default/named catalog locations are retained. Lockfile generation remains a separate explicit pnpm action.

Apply is bound to the same workspace and full input set. Stale YAML, changed manifests/policies, new packages, linked files, partial application and modified plan contents are rejected before writes. It uses the same staged replacements, backups and rollback as dependency fixes, across both YAML and JSON. A fully applied plan and a repeated migration are no-ops. If recovery cannot safely replace a concurrent edit, inspect the listed `.repoctl-deps-*.bak` originals, restore reviewed files, remove stale temporary files and generate a fresh plan; the concurrent edit is preserved.

Public APIs are `checkCatalogs(cwd, options?)`, `planCatalogMigration(cwd, options)` and `applyCatalogMigrationPlan(cwd, plan)`. See [pnpm catalogs](https://pnpm.io/catalogs) for protocol semantics and [Syncpack](https://syncpack.dev/) for intentional version-group policy patterns.
