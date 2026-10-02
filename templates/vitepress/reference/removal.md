# Safely remove a workspace package

`workspace remove` previews one exact package name or explicit workspace-relative directory. It includes root/private consumers, transitive dependency paths, directory contents (including ignored files), precise manifest edits, and source/configuration references for manual review.

```bash
repo workspace remove @acme/legacy
repo workspace remove ./packages/legacy --dry-run --json > ../remove-plan.json
# Explicitly include removal of dependency fields in consumer manifests:
repo workspace remove @acme/legacy --remove-references --json > ../remove-plan.json
repo workspace remove --apply ../remove-plan.json --json
```

Preview is always read-only; `--dry-run` makes that default explicit. Save the plan outside the selected package. A blocked preview still emits JSON and exits with code 1. Applying requires the separate `--apply` command; it cannot be combined with a target, `--remove-references` or `--dry-run`.

## Selection and blockers

The initial version requires a Git repository with a commit and a selected directory free of staged, unstaged, and untracked changes. Ignored files are included in the reviewed inventory. The root package, outside paths, linked target ancestors, embedded repositories, and unselected nested workspaces cannot be removed. Ambiguous names require an explicit `./directory`. There is no force flag for these boundaries.

Consumers block removal by default. `--remove-references` plans only the exact dependency fields shown in the plan, plus matching `peerDependenciesMeta` and unused `dependenciesMeta` entries. Unrelated fields and dependency declarations are retained. Uncertain graph relationships that might reference the target, including unresolved catalog aliases, block application. Only workspaces with a single JSON manifest per package are supported initially.

The review scan inspects Git-tracked text files outside the selected package, using literal package-name/directory matches. It does not resolve imports or dynamic configuration. Untracked/ignored files, binary files, symlinks, hardlinks, files larger than 1 MiB, unsupported text extensions, and the lockfile are excluded. `review.scanned`, `review.matches`, and `review.skipped` describe this limited evidence; matches are manual candidates, not automatic edits. Check source imports, scripts, Turbo configuration, workspace globs, bundled dependency lists, documentation, and release configuration yourself.

## Apply and recovery

Application regenerates the plan and rejects drift in manifests, workspace membership, Git HEAD, reviewed text, directory entries, file content, modification times, or link destinations. JSON plans include absolute paths and manifest contents; review them locally before sharing.

The workspace operation lock `.repoctl/workspace-remove.lock` covers replay checks, validation, writing, verification, rollback and cleanup. An overlapping removal fails as locked, including an identical plan. After a crash, verify that no writer is active and recover retained originals before manually removing the lock.

The transaction stages manifest replacements and moves the selected directory into a unique `node_modules/.cache/repoctl/removals/` operation directory. Recovery ancestors must be real directories. A cross-device move fails safely; no copy/delete fallback is attempted. Before commit, failures restore changed manifests and the directory when doing so is safe. Concurrent edits and a newly created target directory are preserved; the error reports retained original paths for manual recovery. After commit, cleanup failure returns `status: "applied"` with `cleanupPending` paths instead of claiming rollback. Inspect those exact paths before removing them; do not clear the shared cache indiscriminately.

The lockfile is never edited by this command. Finish explicitly with the repository's declared pnpm version:

```bash
pnpm install --lockfile-only
pnpm install --frozen-lockfile
repo check --full
git diff
```

Programmatic callers can use `planWorkspaceRemoval(cwd, { target, removeReferences })` and `applyWorkspaceRemovalPlan(cwd, plan)`. JSON plans use schema version 1. Reapplying an already applied plan returns `unchanged` only when the expected remaining workspace state still matches.
