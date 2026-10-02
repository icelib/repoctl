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

Use it to initialize recommended workspace defaults, with non-interactive CI usage through `--yes`.

Before any initialization writes, it validates the workspace YAML structure, the
`packages` string array, and its globs. Nonempty valid manifests without `packages`,
including `null` and `{}`, retain pnpm's implicit `**` discovery. Missing or empty manifests (including
comment-only documents) receive `apps/*`,
`packages/*`, and `examples/*`; existing explicit arrays receive any missing
defaults. No additions means no text changes. Init and package creation support
alias keys and values for `packages`; additions preserve comments and other field
values and types, expanding references when needed to keep shared values unchanged.
Before writing, the serialized result is reread using pnpm's rules and checked
against the complete planned manifest.

Initialization, package creation, and doctor use pnpm's current YAML core rules.
`%YAML 1.1` does not enable legacy booleans, octal values, timestamps, or `<<`
merges. Explicit non-core tags, including `!!merge` and `!!timestamp`, are
rejected before init or create writes; doctor reports `workspace-manifest` with
status `fail`. Ordinary anchors, aliases, and comments remain supported.

For `catalog` and `catalogs`, pnpm's structural checks reject invalid mappings,
non-string entries, and null named catalogs before init/create writes; doctor
reports `workspace-manifest: fail`. Top-level null catalog fields, empty mappings,
ordinary aliases, and empty string specifiers accepted by pnpm remain valid.

Initialization targets the invocation directory, including a nested directory.
Parent workspace files remain intact. Package `repository.directory` values are
relative to the physical Git root; README links are relative to the README's
physical directory. Existing READMEs are preserved unless overwrite is requested.
Generated README links support package paths containing spaces, parentheses,
`#`, `?`, and literal percent signs. Package names display literally, including
names containing Markdown punctuation such as `_`, `*`, or `~`.

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
repo new docs --template vitepress
repo new docs --template vitepress --dry-run
repo new docs --template vitepress --json --out plans/docs.json
```

Use it to create packages and apps. Explicit template keys are validated first; invalid keys fail with suggestions instead of silently falling back. A missing or blank workspace manifest (including a comment-only document) is initialized with only the exact target path; valid implicit manifests such as `null`, `{}`, or mappings without `packages` stay unchanged.

Generated `repository.directory` values are relative to the physical Git root,
including nested workspaces and new target directories beneath directory aliases.

An interrupted creation can be reviewed and recovered explicitly:

```bash
repo recover apps/sdk --dry-run --json
repo recover apps/sdk
repo recover-create apps/sdk
repo new --recover apps/sdk
repo package create --recover apps/sdk
```

`repo recover` removes only files that still match the interrupted staging
snapshot. User edits, new files, and unknown state are preserved. `--dry-run`
never writes; `--json` and `--out <file>` imply `--dry-run` and report the
stable `status`, `removed`, `preserved`, `targetRemoved`, and `stagingRemoved`
fields.

When an interrupted creation already committed `pnpm-workspace.yaml`, recovery
restores the previous manifest or removes a newly created one only if the target
has no user files and the manifest still belongs to that transaction. Edited or
replaced manifests and missing or damaged recovery records preserve the target
and staging evidence. User files keep their workspace inclusion.
The optional `manifest` result reports `path`, `status`, and optional `reason`;
statuses stay `unchanged`, `would-restore`, `restored`, `preserved`, or `unknown`
in every language. Older markers support target-only recovery and report
`unknown` for the manifest. Previewing recovery does not change the manifest.

Creating another package retains an old staging snapshot while its target still exists or its state cannot be confirmed. Automatic cleanup only removes stale staging when the target is known to be absent.

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

Pre-push discovers pnpm packages by default. For programmatic calls,
`verifyPrePush({ cwd, workspaces })` also accepts relative paths, absolute physical
paths, and directory aliases; it matches physical identities and excludes paths
outside the explicit `cwd` boundary.

When hook input contains pushed refs, verification runs each distinct peeled
commit in a temporary local clone, using that commit's workspace, manifests,
and scripts. Dependencies and install lifecycle scripts trigger
`pnpm install --frozen-lockfile` in the clone; dependency-free checks skip
installation. Failures and SIGINT/SIGTERM clean up the owned clone before exit,
leaving the original checkout and index unchanged. Empty input and deletion-only
pushes retain local lint/typecheck behavior.

## `repo upgrade`

```bash
repo upgrade
repo upgrade --dry-run
repo upgrade --json
repo upgrade --diff
repo upgrade --yes
repo upgrade --overwrite
repo upgrade --no-overwrite
repo upgrade --core
repo upgrade -i
repo upgrade -s
```

Use it to sync standard assets and scripts. `--core` skips GitHub-related assets. `--no-overwrite` preserves changed files.

`--dry-run` previews file actions, reasons, confirmation requirements, and migration dependencies without changing the target workspace or prompting. `--json` and `--diff` also imply preview mode: JSON retains stable machine-readable fields, while `--diff` includes bounded text differences. The same plan is available through `resolveUpgradePlan(opts)` from `repoctl`. Custom release workflows are preserved by default; legacy state is deleted only after its migration dependencies succeed.

If the configured upgrade targets or interactive selection omit a required migration file, legacy release state is preserved and the plan reports `migration-targets-not-selected`. Include `package.json`, `pnpm-workspace.yaml`, and the legacy release workflow to migrate the group. An already managed release workflow can remain an unchanged dependency.

Upgrade and release migration use the same pnpm manifest and catalog validation, preserving existing implicit `**` discovery and metadata values/types (including `on` and explicitly tagged integers under `%YAML 1.1`); failed validation, declined overwrites, or retained custom workflows preserve legacy release configuration and prerelease state. Unchanged manifests retain their original text; changed manifests use formatted YAML checked against the planned values and types.

If an upgrade is interrupted, inspect pending transactions with the exported
`inspectUpgradeTransactions(cwd)` API before retrying. Unfinished journals are
reported as `needs-review` and block another upgrade until the affected files
have been reviewed.

Use `inspectUpgradeLock(cwd)` to inspect the lock without modifying it. It
reports `missing`, `active`, `stale`, or `malformed`; only a stale lock is
eligible for automatic reclaim by a later upgrade.

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
