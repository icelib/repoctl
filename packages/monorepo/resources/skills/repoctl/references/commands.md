# Commands

## init

Purpose: bootstrap workspace metadata plus recommended tooling defaults.
Usage:

- pnpm exec repo init
  Options:
- --preset <minimal|standard>: choose a lighter or fuller setup
- --force: overwrite existing tooling config files
  Notes:
- `standard` is the default preset
- `minimal` currently focuses on the base TypeScript setup
- Initialization validates the workspace YAML structure, the `packages` string array, and its globs before writing any files
- Nonempty valid manifests without `packages`, including `null` and `{}`, retain pnpm's implicit `**`; missing or blank manifests (including comment-only documents) receive `apps/*`, `packages/*`, and `examples/*`, while explicit arrays receive missing defaults
- The original manifest text is retained when no additions are needed; init and creation support alias keys and values for `packages`, preserving comments and other field values and types while expanding references when needed to keep shared values unchanged
- Before writing additions, the serialized result is reread using pnpm's rules and checked against the complete planned manifest
- Init, package creation, and doctor use pnpm's current YAML core rules; `%YAML 1.1` does not enable legacy booleans, octal values, timestamps, or `<<` merges
- Explicit non-core tags such as `!!merge` and `!!timestamp` are rejected before init or create writes; ordinary anchors, aliases, and comments remain supported
- pnpm's structural validation rejects invalid `catalog`/`catalogs` mappings, non-string entries, and null named catalogs before init/create writes
- Top-level null catalog fields, empty mappings, ordinary aliases, and empty string specifiers accepted by pnpm remain valid
- Initialization targets the invocation directory, including nested directories, and preserves parent workspace files
- Package `repository.directory` uses the physical Git root; README links use the README's physical directory, and existing READMEs are preserved by default
- Generated README links support package paths with spaces, parentheses, `#`, `?`, and literal percent signs
- Package names display literally, including Markdown punctuation such as `_`, `*`, or `~`

## new

Purpose: create a new package or app through an intent-driven flow.
Usage:

- npx repoctl new
- npx repoctl new my-lib
  Notes:
- Prompts for what you want to create first, then maps to a template
- `library` defaults to `packages/<name>`
- `web-app`, `api-service`, `docs-site`, and `cli-tool` default to `apps/<name>`
- Advanced users can still use `repoctl package create` or `repoctl pkg new`
- Generated `repository.directory` uses the physical Git root, including nested workspaces and new targets beneath directory aliases
- A missing or blank workspace manifest, including a comment-only document, is initialized with only the exact target path; valid implicit manifests such as `null`, `{}`, or mappings without `packages` stay unchanged

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

Recovery also restores a committed workspace manifest when it still belongs
to the interrupted creation and the target has no user files. User changes,
replacements, or missing or damaged recovery records preserve the target and
staging evidence; user files retain their workspace inclusion. The optional
`manifest` result contains `path`, `status`, and optional `reason`. Its stable
statuses are `unchanged`, `would-restore`, `restored`, `preserved`, and `unknown`.
Older markers support target-only cleanup with manifest status `unknown`.
All preview modes leave the workspace manifest unchanged.

## check

Purpose: run recommended local checks.
Usage:

- npx repoctl check
- npx repoctl check --staged
- npx repoctl check --full
- npx repoctl check --dry-run
- npx repoctl check --json --out reports/check-plan.json
  Notes:
- default mode runs the lightweight local verification flow
- `--staged` adds staged typecheck routing
- `--full` maps to the heavier pre-push verification flow
- `--dry-run` previews the verification route without running checks
- `--json` and `--out <file>` emit the same plan for automation and imply dry-run

Pre-push discovers pnpm packages by default. Programmatic
`verifyPrePush({ cwd, workspaces })` accepts relative paths, absolute physical
paths, and directory aliases, matches physical identities, and excludes paths
outside the explicit `cwd` boundary.

When hook input contains pushed refs, verification runs each distinct peeled
commit in a temporary local clone, using that commit's workspace, manifests,
and scripts. Dependencies and install lifecycle scripts trigger
`pnpm install --frozen-lockfile` in the clone; dependency-free checks skip
installation. Failures and SIGINT/SIGTERM clean up the owned clone before exit,
leaving the original checkout and index unchanged. Empty input and deletion-only
pushes retain local lint/typecheck behavior.

## doctor

Purpose: diagnose whether the current workspace is ready to use.
Usage:

- npx repoctl doctor
- npx repoctl doctor --json
- npx repoctl doctor --json --out reports/doctor.json
  Notes:
- default output is human-readable
- `--json` emits the structured report only and still exits non-zero when blocking failures exist
- `--out <file>` persists the text or JSON report and still exits non-zero when blocking failures exist
- Invalid workspace YAML, including unsupported explicit tags or invalid `catalog`/`catalogs` structures, reports `workspace-manifest` with status `fail`

## upgrade

Purpose: sync repo assets and scripts into the workspace.
Usage:

- npx repoctl upgrade
- npx repoctl workspace upgrade
- npx repoctl ws up
  Options:
- --interactive: prompt for overwrites
- --core: sync core config only (skip GitHub assets)
- --outDir <dir>: write to another directory
- --skip-overwrite: never overwrite existing files
- --dry-run: preview all changes without writing files
- --json: emit the structured plan and imply `--dry-run`
- --diff: include a bounded unified text diff and imply `--dry-run`
- --overwrite-release: explicitly replace an unmarked custom release workflow

If the configured upgrade targets or interactive selection omit a required migration file, legacy release state is preserved and the plan reports `migration-targets-not-selected`. Include `package.json`, `pnpm-workspace.yaml`, and the legacy release workflow to migrate the group. An already managed release workflow can remain an unchanged dependency.

Upgrade and release migration use the same pnpm manifest and catalog validation, preserving existing implicit `**` discovery and metadata values/types (including `on` and explicitly tagged integers under `%YAML 1.1`); failed validation, declined overwrites, or retained custom workflows preserve legacy release configuration and prerelease state. Unchanged manifests retain their original text; changed manifests use formatted YAML checked against the planned values and types.

If an upgrade is interrupted, inspect the pending journal through the exported
`inspectUpgradeTransactions(cwd)` API before retrying. An unfinished journal is
reported as `needs-review` and blocks another upgrade until the ambiguous files
have been reviewed.

For the first migration of an existing project, bootstrap with
`pnpm dlx repoctl@latest upgrade --yes`. Managed and official legacy release
workflows are migrated automatically; unmarked custom workflows are preserved
unless `--overwrite-release` is supplied.

## release ci

Purpose: provide the single GitHub Actions entrypoint for stable and prerelease orchestration.
Usage:

- `pnpm exec repo release ci`
- `pnpm exec repo release ci --mode prepare`
- `pnpm exec repo release ci --mode publish`
- `pnpm exec repo release ci --mode publish-unpublished --package <name> --version <version>`

The command uses `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `GITHUB_API_URL`, and
`GITHUB_SHA` to upsert the Release PR, package tags, and GitHub Releases. It
consumes `pnpm-publish-summary.json` and is safe to retry.

## workspace upgrade (alias: ws up)

Purpose: sync monorepo assets and scripts into the workspace.
Usage:

- npx repoctl workspace upgrade
- npx repoctl ws up
  Options:
- --interactive: prompt for overwrites
- --core: sync core config only (skip GitHub assets)
- --outDir <dir>: write to another directory
- --skip-overwrite: never overwrite existing files
- --dry-run: preview all changes without writing files
- --json: emit the structured plan and imply `--dry-run`
- --diff: include a bounded unified text diff and imply `--dry-run`

The same transaction review rule applies to `repo workspace upgrade`.

## workspace init (alias: ws init)

Purpose: initialize workspace metadata such as README, package.json, pnpm change intent support, and issue template.
Usage:

- pnpm exec repo init
- npx repoctl workspace init
- npx repoctl ws init

## workspace list (alias: ws ls)

Purpose: list workspace packages for inspection or automation.
Usage:

- npx repoctl workspace list
- npx repoctl ws ls --json
- npx repoctl ws ls --json --out reports/workspaces.json
  Options:
- --json: emit structured workspace summary data
- --out <file>: persist the current text or JSON output
- --include-private: include private packages
- --include-root: include the workspace root package
- --pattern <glob>: add custom workspace globs; repeatable

## tooling init (alias: tg init)

Purpose: generate tooling config files plus matching devDependencies.
Usage:

- npx repoctl tooling init
- npx repoctl tooling init eslint tsconfig vitest
- npx repoctl tg init --all
  Options:
- --all: generate every built-in tooling config
- --force: overwrite existing tooling config files
  Notes:
- Built-in tooling targets: commitlint, eslint, stylelint, lint-staged, tsconfig, vitest
- Generated files also update root package.json devDependencies

## workspace clean (alias: ws clean)

Purpose: remove selected packages and update the repo helper package version.
Usage:

- npx repoctl workspace clean
- npx repoctl ws clean
  Options:
- --yes: auto confirm
- --include-private
- --pinned-version <version>

## env info (alias: e i)

Purpose: print environment details for debugging and automation.
Usage:

- npx repoctl env info
- npx repoctl e i --json
- npx repoctl env info --json --out reports/env.json
  Options:
- --json: emit structured environment info
- --out <file>: persist the current text or JSON output
  Notes:
- Includes cwd, workspace root, package manager, Node version, pnpm version,
  platform, arch, and workspace package count.

## env snapshot (alias: e s)

Purpose: collect a combined debugging snapshot for issues, CI artifacts, or editor integrations.
Usage:

- npx repoctl env snapshot
- npx repoctl e s --json
- npx repoctl env snapshot --json --out reports/snapshot.json
  Options:
- --json: emit structured snapshot data
- --out <file>: persist the current text or JSON output
  Notes:
- Includes `env info`, `doctor` report data, and the default `check` plan.

## env mirror (alias: e m)

Purpose: set VSCode binary mirror env.
Usage:

- npx repoctl env mirror
- npx repoctl e m

## skills sync

Purpose: sync the `repoctl` skill into global agent skill directories. Use
`--all` when all supported agents should receive the same skill version.
Usage:

- pnpm exec repo skills sync
- pnpm exec repo skills sync --codex
- pnpm exec repo skills sync --claude
- pnpm exec repo skills sync --cursor
- pnpm exec repo skills sync --agents
- pnpm exec repo skills sync --grok
- pnpm exec repo skills sync --all

## ai prompt create (aliases: ai p create, ai p new)

Purpose: generate agentic prompt templates.
Usage:

- npx repoctl ai prompt create
- npx repoctl ai p new --name checkout
- npx repoctl ai prompt create --tasks agentic/tasks.json --format md -f
  Options:
- --output <path>
- --force
- --format <md|json>
- --dir <path>
- --name <name>
- --tasks <file>
  Notes:
- If no --output or --name is set, it prompts for a folder and writes to
  agentic/prompts/<timestamp>/prompt.md.
- If --tasks is used, it expects a JSON array of strings or objects.

## package create (alias: pkg new)

Purpose: create a new package from a template.
Usage:

- npx repoctl new
- npx repoctl package create [path]
- npx repoctl pkg new [path]
  Notes:
- Prefer `repoctl new` for the lower-cost guided flow.
- Prompts for a template choice unless defaults are set in repoctl.config.ts or monorepo.config.ts.
- Explicit `--template` values are validated before writing files. Unknown keys
  fail with the closest suggestion instead of silently falling back.
- Use `--json` to print the resolved create plan for automation. It implies
  `--dry-run` and does not write files.
- Add `--out <file>` to write the preview or JSON plan to disk. It also implies
  `--dry-run`.
