# Prepare build and production artifacts

`repo workspace prepare` previews one exact package. `prune` invokes locally installed Turbo 2 to produce a partial monorepo and pruned lockfile. `deploy` invokes the exact pnpm version pinned in the root `packageManager` to prepare a production directory. It prepares local files; it does not run the application, build an image or contact a deployment platform.

```sh
# Build inputs and runtime entrypoints explicitly first.
pnpm build
repo workspace prepare @acme/service --mode prune --out ../service-build --json > ../prune-plan.json
repo workspace prepare --apply ../prune-plan.json

# Split Turbo's output into full/json Docker cache layers.
repo workspace prepare ./apps/service --mode prune --docker --out ../docker-context --json

# Production workspace dependencies; use only packages already in the local store.
repo workspace prepare @acme/service --mode deploy --entry dist/server.js --offline --out ../service-runtime --json > ../deploy-plan.json
repo workspace prepare --apply ../deploy-plan.json
```

Preview is always read-only, including `--dry-run`; native version, capability and path-setting probes do not install tools. Save the JSON plan outside the source workspace. Applying requires a separate `--apply` command and cannot be combined with preview selections or `--dry-run`.

## Native behavior and prerequisites

Both modes require a pnpm workspace and existing `pnpm-lock.yaml`. Select one uniquely named non-root package by exact npm name or `./directory`; globs, multiple matches and dependency selectors are rejected. The output must be outside the source workspace under an existing directory. Linked, overlapping and unrelated nonempty targets are rejected; there is no force flag.

Prune supports locally installed stable Turbo 2 and keeps native build dependency selection. `manifestCandidates` only explains manifest relationships; Turbo decides what is retained. Native task-dependency and global-file behavior follows the selected Turbo version and configuration. `--docker` retains its native `full`, `json` and lockfile layout.

Deploy supports pinned stable pnpm 10, 11 and 12 when their native command exposes the supported options. It uses `--prod`, `--ignore-scripts`, `--frozen-lockfile` and disables pnpmfile hooks. `--legacy` explicitly selects native legacy behavior, whose production layout may omit a root lockfile; only prune requires that output file. Since pnpm 12.2, native deploy supports non-injected workspace dependencies; earlier versions may require `injectWorkspacePackages` or legacy mode. Peer ambiguity and other native errors remain failures with their native diagnostic code. repoctl does not resolve or rewrite dependency graphs or lockfiles itself.

Deploy checks an existing built runtime file: explicit `--entry`, `package.main`, or a single `bin`. If native `files`/ignore rules omit it, preparation fails. Arbitrary `start` scripts are not interpreted or executed. Native dependency lifecycle scripts stay disabled, so prepare required native binaries explicitly before deployment; artifact preparation does not certify arbitrary application behavior.

## Source and output boundaries

Native tools run against an isolated source copy, without source `node_modules`, `.git`, `.turbo` or `.repoctl` storage. Real `.env`/`.env.*`, `.npmrc`, `.netrc`, `_netrc`, Yarn authentication configuration, `.aws`, `.ssh` and `.gnupg` paths are excluded before copying. Public `.env.example` and `.env.sample` files remain. The output is checked again for these paths. This is a named-file policy, not a general secret detector; use public placeholders in example files and provide deployment credentials separately.

The source copy retains built files even if Git ignores them; native prune/package file rules still control final inclusion. Source symlinks and special files are rejected. Input and output inventories are bounded to 100,000 entries and 1 GiB. Use native tools directly when a workspace needs different copy or storage policies.

Effective pnpm store/cache/state/module/lockfile paths are inspected without dumping credential-bearing configuration. Paths that would write back into the source workspace are rejected before deploy, and module/lockfile storage must remain relative to the artifact. Staging itself must be outside the source workspace. Native global stores outside the workspace remain under pnpm's control.

Output links must resolve inside the artifact. Relative links are preserved; Windows directory junctions are recreated against the final artifact directory. When transferring a Windows artifact, use a copy/archive method that materializes junction contents. Integration tests copy the directory, remove the source and original artifact, then execute the production entry independently.

## Review, recovery and repeated application

Plans fingerprint source files, modes, tool/version evidence, relevant path settings and options. Apply reconstructs the plan and rejects changes. Source inputs are rechecked after copying, after native execution, during publication and before completion. Concurrent source edits are preserved.

Native output is staged first. Publication creates files exclusively, records their ownership and written contents, and commits `.repoctl-artifact.json` last. Files may be visible before the receipt commits; do not consume an incomplete directory. Failures remove only unchanged operation-owned output and retain concurrent edits with their exact paths in the error. Cleanup failure after successful publication returns `cleanupPending` rather than claiming rollback.

Reapplying an unchanged plan returns `unchanged` only if its complete receipt and file inventory still match. Unknown or modified nonempty output is never overwritten. The `.repoctl/workspace-artifacts.lock` covers replay checks through native execution, publication and cleanup. After a crash, confirm no writer remains, inspect incomplete output and retained staging paths, and recover them before removing the lock.

Public APIs: `planWorkspaceArtifact(cwd, options)` and `applyWorkspaceArtifactPlan(cwd, plan, { signal, timeoutMs })`; JSON schema version is 1. Native execution defaults to a two-minute timeout, configurable up to ten minutes through the API.

References: [Turbo prune](https://turborepo.com/docs/reference/prune) and [pnpm deploy](https://pnpm.io/cli/deploy).
