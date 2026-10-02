# Move or rename a workspace

`repo workspace move` previews a directory move, npm package rename, or both. Select one package by exact name or `./directory`; use `--to` for its workspace-relative directory and `--name` for its npm name.

```bash
repo workspace move @acme/ui --to libs/ui --json > ../move-plan.json
repo workspace move @acme/ui --name @acme/design --json > ../rename-plan.json
repo workspace move ./packages/ui --to libs/design --name @acme/design --json > ../move-plan.json
repo workspace move --apply ../move-plan.json --json
```

Preview is read-only. Save the JSON outside the selected directory and review the old/new identity, direct and transitive consumers, file contents, changed fields, blockers, and manual tasks before applying. A clean Git target and clean files to be updated are required. There is no force mode. `--apply` cannot be combined with selection or preview options.

The plan updates dependency keys in all four dependency sections, matching dependency metadata, `workspace:` and `npm:` aliases, and relative `workspace:`, `link:` and `file:` references. Alias keys remain stable unless they equal the renamed package's name. Plain semver edges use the shared workspace graph's local-candidate semantics; unresolved or nonlocal declarations appear in review candidates instead of being guessed. Matching `repository.directory` values are updated. Existing workspace globs remain; exact package entries are moved and a destination entry is added when needed. An excluded destination is rejected.

Tracked `tsconfig.json` and `tsconfig.*.json` files support JSONC comments, relative `extends`, project references, `files`/`include`/`exclude`, path aliases, and explicit `baseUrl`, `rootDir`/`rootDirs`, `outDir`, `declarationDir`, and `typeRoots`. Broader include/exclude globs whose coverage may change are preserved and reported for manual review; wildcard expansion is not analyzed. Config inheritance is not evaluated. When `paths` could depend on an inherited `baseUrl`, that field remains untouched with a manual task. Absolute paths, executable configurations and other configuration formats require review.

Source code is preserved. Manual tasks report file and line candidates for old names, old paths and relative string paths that may change meaning. This is a bounded scan of Git-tracked text, not an exhaustive import resolver: ignored/untracked files, binary files, files over 1 MiB, generated code, interpolated strings and dynamic references are outside its coverage. Symlink text is preserved and reported for review. Resolve these tasks before building; a renamed direct dependency still needs its source imports updated by the developer.

Root/outside paths, occupied destinations, duplicate or invalid names, links in the destination ancestry, overlapping workspaces, nested Git repositories, dirty inputs and stale plans are rejected. The operation inventories all selected files, including ignored files, and verifies hashes, file identity, workspace membership and Git HEAD before committing changes. A failure rolls back manifests and the directory when safe. Concurrent edits and replacement directories are preserved; recovery errors report the retained paths. A committed operation with cleanup failures returns `status: applied` and `cleanupPending`; inspect those files before cleanup. An unchanged successful plan can be applied again without writing.

Applications hold `.repoctl/workspace-move.lock` from the first fresh/replay check through cleanup or rollback. A concurrent application fails closed. After a process crash, verify that no writer is active and recover pending backups before manually removing a stale lock.

The command does not rewrite the lockfile or run install scripts. After resolving manual tasks, run:

```bash
pnpm install --lockfile-only
pnpm install --frozen-lockfile
repo check
git diff
```

Renaming a published package creates a new npm package identity. No publishing, deprecation, Git commit or Git push is performed by this command.

The built API exports `planWorkspaceMove(cwd, options)`, `applyWorkspaceMovePlan(cwd, plan)`, `WorkspaceMoveOptions`, `WorkspaceMovePlan` and `WorkspaceMoveResult`.
