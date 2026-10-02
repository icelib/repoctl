# @icebreakers/monorepo

English | [简体中文](README.zh-CN.md)

Core engine and programmatic APIs for repoctl.

Most users should install [`repoctl`](https://www.npmjs.com/package/repoctl) and use the `repo` command. Install this package directly when you need its lower-level workspace, configuration, diagnostics, release, or tooling APIs.

```bash
pnpm add -D repoctl
pnpm exec repo doctor
```

## Programmatic usage

```ts
import {
  getWorkspacePackageSummaries,
  runDoctor,
} from '@icebreakers/monorepo'

const workspace = await getWorkspacePackageSummaries(process.cwd())
const report = await runDoctor(workspace.workspaceDir)
```

Tooling wrappers are available from either `@icebreakers/monorepo/tooling` or the recommended `repoctl/tooling` entrypoint.

`getWorkspacePackages(root)` excludes the root package even through a directory
alias. Set `ignoreRootPackage: false` to include it once; private packages still
require `ignorePrivatePackage: false`. `getWorkspaceData(cwd)` returns physical
`workspaceDir` and package paths while keeping the caller's absolute `cwd`,
including when no workspace manifest exists. Directory aliases are resolved on
every call. In a long-running process, call `clearWorkspaceCache()` after changing
workspace manifests or package directories.

`verifyPrePush({ cwd, workspaces })` accepts paths relative to `cwd`, absolute
physical paths, and directory aliases. It matches their physical identities and
filters out paths outside that `cwd`; omitting `workspaces` retains automatic
pnpm workspace discovery.

When hook input contains pushed refs, verification runs each distinct peeled
commit in a temporary local clone, using that commit's workspace, manifests,
and scripts. Dependencies and install lifecycle scripts trigger
`pnpm install --frozen-lockfile` in the clone; dependency-free checks skip
installation. Failures and SIGINT/SIGTERM clean up the owned clone before exit,
leaving the original checkout and index unchanged. Empty input and deletion-only
pushes retain local lint/typecheck behavior.

Creation and initialization write `repository.directory` relative to the physical
Git root, including nested workspaces and new targets beneath directory aliases.
`initMetadata(cwd)` initializes the supplied directory. Its README stays there
with links relative to its physical location; initializing a nested directory
keeps the parent workspace files intact. Existing READMEs are preserved by default.
Generated README links support package paths containing spaces, parentheses,
`#`, `?`, and literal percent signs. Package names display literally, including
names containing Markdown punctuation such as `_`, `*`, or `~`.

Initialization validates the workspace YAML structure, the `packages` string
array, and its globs before writing. Missing or blank manifests (including
comment-only documents) receive `apps/*`, `packages/*`, and `examples/*`;
existing explicit arrays receive missing defaults. Package creation initializes
missing or blank manifests with only the exact target path. Both preserve valid
implicit `**` manifests such as `null`, `{}`, or mappings without `packages`,
and retain the original text when no additions are needed. Additions support
alias keys and values for `packages`, preserving comments and other field values
and types; references are expanded when needed to keep shared values unchanged.
Before writing, the serialized result is reread using pnpm's rules and checked
against the complete planned manifest.

Initialization, package creation, and doctor interpret workspace manifests using
pnpm's current YAML core rules. `%YAML 1.1` does not enable legacy booleans,
octal values, timestamps, or `<<` merges. Explicit non-core tags, including
`!!merge` and `!!timestamp`, are rejected before init or create writes; doctor
reports `workspace-manifest` with status `fail`. Ordinary anchors, aliases, and
comments remain supported.

For `catalog` and `catalogs`, pnpm's structural checks reject invalid mappings,
non-string entries, and null named catalogs before init/create writes; doctor
reports `workspace-manifest: fail`. Top-level null catalog fields, empty mappings,
ordinary aliases, and empty string specifiers accepted by pnpm remain valid.

For interrupted package creation, `inspectCreateTarget(targetDir)` provides a
read-only ownership status and `recoverCreateTarget(targetDir, { dryRun: true })`
previews safe cleanup. Recovery only removes files that still match the
staging snapshot and keeps edits, additions, and unknown state for review.
After all generated target files can be removed, recovery also restores the
previous workspace manifest when it still belongs to the interrupted creation.
User changes or an invalid recovery record preserve the target and staging
evidence; user files in the target also preserve its workspace inclusion.
The optional `manifest` result has the exported `CreateManifestRecoveryResult`
type with `path`, `status`, and optional `reason`. Statuses are `unchanged`,
`would-restore`, `restored`, `preserved`, or `unknown`; older creation markers
support target-only cleanup and report the manifest as `unknown`.
The same recovery flow is available from the CLI with `repo recover <target>`
(alias `recover-create`), or `repo new --recover <target>` and
`repo package create --recover <target>`. Add `--dry-run` to preview; `--json`
and `--out <file>` also preview and emit the stable recovery result.

Upgrade and release migration use the same pnpm manifest and catalog validation, preserving existing implicit `**` discovery and metadata values/types (including `on` and explicitly tagged integers under `%YAML 1.1`); failed validation, declined overwrites, or retained custom workflows preserve legacy release configuration and prerelease state. Unchanged manifests retain their original text; changed manifests use formatted YAML checked against the planned values and types.

For interrupted upgrades, `inspectUpgradeTransactions(cwd)` reports unfinished
journals without modifying the workspace. `inspectUpgradeLock(cwd)` separately
reports whether the lock is missing, active, stale, or malformed. Both APIs are
read-only; review affected files before removing a journal or malformed lock.

## Compatibility

This package retains the `repo` and `repoctl` bins for existing installations. New user documentation recommends the `repoctl` package; the command surface is shared.

## Project links

- Documentation: https://repoctl.icebreaker.top
- Repository: https://github.com/icelib/repoctl/tree/main/packages/monorepo
- Issues: https://github.com/icelib/repoctl/issues
