# Dependency consistency

Use `repo deps check --json` to inventory root/private/workspace dependency declarations by name, dependency section and configured cohort. Reports distinguish identical, equivalent, compatible, conflicting, uncomparable, managed and exception groups with exact file locations. Catalog references are resolved for comparison; workspace references and unknown protocols remain report-only. npm aliases retain their actual source package. Peer and development declarations are independent.

Create a read-only preview with `repo deps plan <dependency> --section <section> --to <specifier> --json`. `deps fix` aliases `deps plan`; neither writes manifests. The target is explicit and must overlap the entire compatible cohort. No registry queries or automatic major upgrades occur. Save and review JSON, then use `repo deps apply <plan.json>`. pnpm lockfile updates and installation are explicit user steps: `pnpm install --lockfile-only`, then `pnpm install --frozen-lockfile`.

Configure `commands.deps.groups` at the workspace root. Each group has a unique `name`, exact workspace-relative `workspaces`, exact `dependencies`, a nonempty `reason`, optional `sections`, and optional `ignore: true` for report-only exceptions. Unmatched declarations use `default`; ambiguous overlapping selectors fail. Choose a cohort with `--group`.

Plans carry before/after specifiers and input/file hashes. Applying re-discovers the workspace, verifies every input, reconstructs the planned changes and rejects stale or modified plans before replacement. Repeated applications are no-ops. Multi-file replacements retain backups until completion and roll back failures. On interrupted or failed recovery, inspect the reported `.repoctl-deps-*.bak` backups before generating another plan. Do not overwrite unrelated concurrent edits.

Public APIs: `checkDependencies`, `planDependencyFix`, `applyDependencyFixPlan` from `repoctl`. JSON schema/status keys remain independent of locale.
