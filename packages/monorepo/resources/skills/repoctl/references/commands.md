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

## check

Explicit unused-code/dependency analysis is available through `repo check knip`.
See [Optional Knip checks](./knip.md) before enabling native analysis or saving a baseline.

Purpose: run recommended local checks.
Usage:

- npx repoctl check
- npx repoctl check --staged
- npx repoctl check --full
- npx repoctl check --affected --base origin/main --head HEAD --json
- npx repoctl check --affected --filter @acme/web --report reports/affected.json
- npx repoctl check --dry-run
- npx repoctl check --json --out reports/check-plan.json
- npx repoctl check --full --report reports/check-result.json --redact
- npx repoctl check --full --report reports/check-result.md --report-format markdown
  Notes:
- default mode runs the lightweight local verification flow
- `--affected` selects changed packages and consumers, using merge-base plus the current working tree.
  Missing history, manifest/global input changes and unresolved graph diagnostics explicitly fall back
  to full checks. `--filter` intersects exact names/directories; `--global-input` adds globs.
  Both flags are repeatable. Execution uses build, lint, typecheck, tsd, test order; build includes
  dependency prerequisites and pnpm controls package ordering. Plans explain files, paths and skips.
  Existing preview flags remain read-only; reports embed the same model as `affectedPlan`.
  Affected mode cannot combine with full, staged or edit-file. Root scripts implement full fallback
  where available; explicit filters limit fallback checks too. See tasks/checks for global input rules.
- `--staged` adds staged typecheck routing
- `--full` runs the existing root lint, typecheck, test and build scripts
- `--dry-run` previews the verification route without running checks
- `--json` and `--out <file>` emit the same plan for automation and imply dry-run
- `--report <file>` executes checks and writes versioned results separately from live logs;
  `--report-format` accepts `json` (default) or `markdown`. It cannot be combined with preview flags.
- Reports preserve failures, skipped tasks and graceful signal interruptions, with timestamps,
  duration, exit code and actual command arguments. `--redact` replaces cwd/home prefixes.
  Environment values and child output are not persisted. Abrupt termination cannot guarantee a report.

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

## upgrade

Preview the complete operation with `repo upgrade --dry-run`, `--json` or `--markdown`; these modes never write or prepare missing assets. Save JSON and review every add/modify/delete/skip/conflict before `repo upgrade --apply <plan.json>`. Plans contain exact bytes and input hashes, including semantic merges and legacy prerelease metadata migration. Application rejects stale inputs, keeps migration groups together and rolls back recoverable failures. Retained `.repoctl-upgrade-*.bak` originals support manual recovery after interruption or a concurrent edit. `--no-overwrite` protects existing assets and legacy metadata; custom release workflows still require `--overwrite-release`. Public APIs: `planUpgrade`, `formatUpgradePlan`, `applyUpgradePlan`, and `upgradeMonorepo({ dryRun: true })`.

Root assets use old-upstream/local/new-upstream three-way merging. Commit `.repoctl/baselines/root/` to preserve the upstream records across clones; record updates are reviewed in each file's `baseline` plan entry and applied atomically with that file. Independent changes merge automatically, while conflicting files and their baselines stay unchanged. Local deletion is never undone. API results expose unresolved `conflicts`; CLI preview and apply exit with code 1 when conflicts remain. Saved plans are reviewed write payloads; their hashes detect stale inputs and inconsistent content, not authorship. Generated app/package directories are outside this feature.

Upgrade apply holds `.repoctl/upgrade.lock` through validation, no-op detection, writes, rollback and cleanup. It never removes colliding recovery files, changed recovery bytes or replacement directories. After an interruption, confirm no writer is active and recover retained backups before removing the lock and regenerating the plan.

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
- --overwrite: explicitly replace differing managed assets and adopt the new upstream baseline
- --overwrite-release: explicitly replace an unmarked custom release workflow

For the first migration of an existing project, preview with
`pnpm dlx repoctl@latest upgrade --json`. A differing asset without a historical
baseline remains a `baseline-missing` conflict, including a legacy release
workflow. Review an explicit `--overwrite --json` plan before applying it;
`--yes` alone does not resolve conflicts. Unmarked custom release workflows
remain protected unless `--overwrite-release` is supplied.

## release plan and branch mapping

Use `repo release plan --branch 1.x --json` to inspect native versions before consuming intents.
`commands.release.branches` maps a primary `stable` branch (default `main`), bounded non-overlapping
`maintenance: [{ branch, range, tag }]`, and optional `prerelease: [{ branch, lane, tag, target }]`.
Stable and maintenance use pnpm's `main` lane; `branchRule` reports the Git branch, native lane,
allowed range, maintenance exclusions, npm dist-tag and target. Private versions are not publication
candidates. Maintenance ranges apply to every public package; latest excludes those ranges.
Names and tags must be unique; use `legacy-1`, not a SemVer-like npm tag. `snapshot-` is reserved.
Preview/apply `repo upgrade` after configuration changes to synchronize managed workflow branches.
Preparation, PR base, publish tag and original-source recovery all use the selected rule. Recovery
SHA must belong to `origin/<selected-branch>`. `pre exit` returns the target lane and reports the
stable/maintenance branch without switching Git branches.

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

## workspace graph / why / impact

Purpose: inspect read-only manifest dependency relationships using one stable graph model.
Usage:

- npx repoctl workspace graph --json --redact
- npx repoctl workspace graph --mermaid
- npx repoctl workspace graph --package @acme/shared --type dependencies
- npx repoctl workspace why @acme/web @acme/shared --json
- npx repoctl workspace impact @acme/shared --direct --json

Private packages are included by default; use `--exclude-private` or `--include-root` to adjust discovery.
`--type` can be repeated with dependencies, devDependencies, peerDependencies or optionalDependencies.
Graph package filters retain the selected nodes and their direct incoming/outgoing relationships.
Why returns one deterministic shortest path; impact returns reverse reachability and minimum distances.
Names must be unambiguous; `./packages/name` explicitly selects a directory. Cycles are safe.
Workspace aliases/ranges and local paths resolve internally; ordinary semver/npm aliases only connect
when the local version matches. This does not resolve lockfiles, catalogs, registry tags or source imports.
Edges distinguish workspace/local references from semver candidates through `resolution`.
Catalogs and unsupported specifiers with local candidates retain `unresolved_specifier` diagnostics;
inspect diagnostics before treating the graph as complete or computing affected checks.
JSON has schema version 1, stable directory IDs and unresolved/ambiguous reference diagnostics.
Mermaid uses the same graph. Queries do not write files; JSON and Mermaid flags are mutually exclusive.

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

Remove explicitly selected workspace package directories. Nothing is preselected.
Empty selection or cancelling the prompt changes no files. Repository docs,
`.qoder`, and global agent skills are not added to the selection or removed as
cleanup side effects.
Clean configuration is read from the workspace root, including when invoked from
a package subdirectory.

See also `deps check`, `deps plan` and `deps apply` in [Dependency consistency](./dependencies.md) for version policy and reviewed manifest changes.

```bash
pnpm exec repo workspace clean --dry-run
pnpm exec repo workspace clean --yes --dry-run
pnpm exec repo workspace clean --yes
```

- `--yes` selects all eligible packages after `ignorePackages` and private-package filtering.
- `--dry-run` prints a JSON plan with `deletions` and every root `package.json`
  dependency change; it does not write a report file or modify the workspace.
- `--include-private` overrides `commands.clean.includePrivate: false`.
  Private packages are included by default for compatibility.
- `--pinned-version <version>` explicitly replaces `devDependencies.repoctl`.
  Otherwise its current range is retained; when absent, `latest` is used.

Only a nonempty selection may also remove the legacy
`devDependencies.@icebreakers/monorepo` entry and ensure `devDependencies.repoctl`.
An already-correct manifest is not rewritten. All targets are validated before
execution: workspace root/outside paths, symbolic-link targets or parent paths,
linked root manifests, and unselected nested workspaces are rejected. Dependency
references from consuming packages are not rewritten by this command.

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

## Affected CI matrix

`repo check --affected --matrix` previews a versioned GitHub Actions matrix without running checks. `--shards N` deterministically groups workspaces into at most 1–256 jobs. Reuse base/head, filters and global inputs from affected mode. Pass only `matrix` to Actions `fromJSON`, gate strategy expansion with `hasWork`, and execute each row's non-skipped executable/args arrays in order from the checkout root. Each job builds dependencies itself. Full fallbacks stay in one job and retain diagnostics. No workflow is changed or triggered; only explicit `--out` writes a report.

## `repo tooling references`

`check --json` checks existing references without opt-in. `plan` and `sync --dry-run` preview deterministic JSON without writes. With `tooling.projectReferences.enabled: true`, use `sync` or `apply <plan.json>` to maintain only registered references. Existing manual references and TypeScript/Vue validation scripts are preserved; incompatible compiler options, cycles, missing targets and stale plans block application. See [configuration](./config.md#typescript-project-references) for discovery, explicit compilation relationships, ownership and recovery.

## release snapshot

`repo release snapshot --kind pr --pr <number> --commit <full-HEAD-sha> --build-id <run-attempt> --dry-run --json` previews deterministic temporary versions. Use `--kind nightly` without `--pr` for nightly packages. Without dry-run, archive committed HEAD outside the repository, install frozen dependencies, build, pack and validate isolated consumers. `--output` chooses an external artifact parent. Every public package receives an exact snapshot version and internal references follow those versions. Source manifests/intents/ledger/changelogs/Git refs stay unchanged.

`--publish` requires `REPOCTL_SNAPSHOT_PUBLISH=1` in a trusted same-repository GitHub Actions event whose SHA matches HEAD: `pull_request` for PRs; `schedule` or `workflow_dispatch` for nightly. Fork and `pull_request_target` publication is rejected. Only snapshot tags are used; no GitHub Releases or Git tags are created. Repeat the same identity only for identical artifacts; metadata and tarball integrity are checked before skipping existing versions. Unknown registry state fails closed. Reports retain exact install instructions, artifact paths and validation errors.
