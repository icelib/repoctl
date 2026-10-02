# repoctl

English | [简体中文](README.zh-CN.md)

`repoctl` is the recommended package for the repoctl CLI. The package name is `repoctl`; the primary executable is `repo`.

## Install

```bash
pnpm add -D repoctl
```

## Start with an existing workspace

```bash
pnpm exec repo init
pnpm exec repo doctor
pnpm exec repo templates
pnpm exec repo new my-package
pnpm exec repo check
```

Generated workspaces also expose conflict-free root scripts such as `repo:init`, `repo:doctor`, `repo:new`, and `repo:check`.

## Common workflows

```bash
# inspect or update a workspace
pnpm exec repo doctor --json
pnpm exec repo upgrade --dry-run
pnpm exec repo upgrade --json
pnpm exec repo upgrade --yes

# preview creation without writing files
pnpm exec repo new dashboard --template vue-hono --json

# recover a package creation interrupted after publishing started
pnpm exec repo recover apps/dashboard --dry-run --json
pnpm exec repo recover apps/dashboard

# inspect verification before running it
pnpm exec repo check --dry-run
pnpm exec repo check --full

# collect a support bundle
pnpm exec repo env support --json --redact --out reports/support.json
```

Upgrade `--dry-run` and `--json` preview changes without writing files or prompting; `--json` implies `--dry-run`. Plans include file actions, reasons, confirmation requirements, migration dependencies, and bounded content statistics. Add `--diff` for a bounded unified text diff; binary or oversized files report bytes and hashes only. Custom release workflows are preserved by default. Legacy release state is deleted only after all related migration changes are accepted and applied successfully.

If the configured upgrade targets or interactive selection omit a required migration file, legacy release state is preserved and the plan reports `migration-targets-not-selected`. Include `package.json`, `pnpm-workspace.yaml`, and the legacy release workflow to migrate the group. An already managed release workflow can remain an unchanged dependency.

Upgrade and release migration use the same pnpm manifest and catalog validation, preserving existing implicit `**` discovery and metadata values/types (including `on` and explicitly tagged integers under `%YAML 1.1`); failed validation, declined overwrites, or retained custom workflows preserve legacy release configuration and prerelease state. Unchanged manifests retain their original text; changed manifests use formatted YAML checked against the planned values and types.

Package creation honors pnpm workspace patterns and exclusions, and restores its changes on failure. Generated scripts use distributed tooling. Pre-push discovers the actual packages, handles deletion and both sides of renames, builds changed package dependencies first when it must fall back to package scripts, and runs build → lint → typecheck → tsd → test without duplicating root and package tasks.

When hook input contains pushed refs, verification runs each distinct peeled
commit in a temporary local clone, using that commit's workspace, manifests,
and scripts. Dependencies and install lifecycle scripts trigger
`pnpm install --frozen-lockfile` in the clone; dependency-free checks skip
installation. Failures and SIGINT/SIGTERM clean up the owned clone before exit,
leaving the original checkout and index unchanged. Empty input and deletion-only
pushes retain local lint/typecheck behavior.

Creation and initialization write `repository.directory` relative to the physical
Git root, including nested workspaces and new targets beneath directory aliases.
Initialization writes the README in the invocation directory with links relative
to its physical location. Initializing a nested directory preserves the parent
workspace files; existing READMEs are preserved by default.
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

## Language

Output is English by default. Use `--lang zh-CN` or `REPOCTL_LANG=zh-CN` for Simplified Chinese.

```bash
pnpm exec repo --lang zh-CN doctor
REPOCTL_LANG=zh-CN pnpm exec repo check --dry-run
```

## Advanced APIs

`repoctl` re-exports the programmatic APIs from `@icebreakers/monorepo`. Tooling wrappers are available from `repoctl/tooling`.

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

`resolveUpgradePlan(opts: CliOpts): Promise<UpgradePlan>` provides the same read-only upgrade preview without invoking the CLI:

```ts
import { resolveUpgradePlan } from 'repoctl'

const plan = await resolveUpgradePlan({ cwd: '.' })
```

If an upgrade process is interrupted, `inspectUpgradeTransactions(cwd)` returns
the pending transaction journals without changing the workspace. A journal in
`needs-review` state blocks a later upgrade so that ambiguous user edits are
never guessed over; review the reported paths and remove the journal only
after confirming the target files are safe.

Use `inspectUpgradeLock(cwd)` to read whether the workspace lock is missing,
active, stale, or malformed without changing it. A stale lock can be reclaimed
by a later upgrade; active and malformed locks should be reviewed first.

If a package creation process is interrupted after it creates its target,
`inspectCreateTarget(targetDir)` reports whether the ownership marker is
missing, active, stale, or malformed. A stale target can be previewed with
`recoverCreateTarget(targetDir, { dryRun: true })` and then recovered explicitly.
Recovery removes only files that still match the staging snapshot. Once the
target has no user files, it also restores the previous `pnpm-workspace.yaml`
or removes a manifest created by that transaction, provided the manifest still
belongs to that creation. User edits or replacements, missing or damaged
recovery records, and unknown staging directories preserve the recovery evidence
for review. Targets with user files keep their workspace inclusion.
The CLI exposes the same flow through `repo recover <target>` (alias
`recover-create`), `repo new --recover <target>`, and
`repo package create --recover <target>`. `--json` and `--out <file>` imply a
read-only preview and return the stable `status`, `removed`, `preserved`,
`targetRemoved`, and `stagingRemoved` fields. The optional `manifest` field uses
the exported `CreateManifestRecoveryResult` type: `path`, `status`, and optional
`reason`. Its stable statuses are `unchanged`, `would-restore`, `restored`,
`preserved`, and `unknown`. Older creation markers remain recoverable through
target-only cleanup and report the manifest status as `unknown`.

The exported `UpgradePlan` has this shape; file paths and `dependsOn` entries are relative to `targetDir`:

```ts
interface UpgradePlan {
  cwd: string
  targetDir: string
  files: {
    path: string
    action: 'create' | 'update' | 'delete' | 'skip'
    reason: string
    requiresConfirmation: boolean
    dependsOn: string[]
    diff?: {
      kind: 'text' | 'binary'
      beforeBytes: number
      afterBytes: number
      beforeHash: string | null
      afterHash: string | null
      addedLines: number
      deletedLines: number
      truncated: boolean
      text?: string
    }
  }[]
}
```

Tooling configuration example:

```ts
import { defineEslintConfig } from 'repoctl/tooling'

export default await defineEslintConfig()
```

## Project links

- Documentation: https://repoctl.icebreaker.top
- Repository: https://github.com/icelib/repoctl/tree/main/packages/repoctl
- Issues: https://github.com/icelib/repoctl/issues
