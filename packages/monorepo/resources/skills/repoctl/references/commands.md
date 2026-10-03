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

## check cache

`repo check cache <current-summary.json> [previous-summary.json] --json` analyzes existing Turbo run summaries without running tasks or mutating caches. Use `--markdown` and redirect stdout for a CI artifact; `--slowest` accepts 1–100. Schema 1 compares stable task IDs and digested input/global/dependency/environment/configuration evidence. Missing evidence or unsupported schemas remain unknown; cache misses are not assigned a speculative cause. Actual durations and a verifiable dependency critical path are reported separately from observed wall span. Environment values and commands never appear in output. Parent execution and file-output flags are rejected; regular check JSON remains preview-only.

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

```bash
repo doctor --list-rules
repo doctor --rules root-scripts,package-manager --strict
repo doctor --rules root-scripts --fix --out plans/doctor-fix.json
repo doctor --apply plans/doctor-fix.json --json
```

`--rules` selects exact stable check IDs before execution; unknown IDs fail and list the available rules. The CLI replaces `commands.doctor.rules`; omitted rules run all checks, while an explicit empty config array runs none. Shared discovery and rule prerequisites still run. `manifest-health` is an aggregate over the static manifest checks. Workspace boundaries and dependency admission use stable `boundary-*` / `admission-*` IDs; selecting only `boundary-policy` or `admission-policy` preserves the actual aggregate failure status, and prerequisite configuration failures remain visible. Custom policy names appear only in diagnostic details.

Configure reasoned waivers under `commands.doctor.suppressions`. Each item needs `id` and a nonempty `reason`; optional `path` matches an exact workspace-relative finding path. Optional `expires` is an inclusive UTC date (`YYYY-MM-DD`). JSON retains the original finding status, `suppression`, `rawSummary`, and every waiver with its matched count. Only active waivers are excluded from effective `summary` and strict exit status; expired and unmatched waivers remain visible.

`--fix` previews JSON without modifying project files. Only missing `repo:init`, `repo:new`, `repo:check`, and `repo:doctor` keys in the root `package.json` are supported. Existing values, including empty/custom scripts, are preserved for manual review. An actively suppressed or unselected rule produces no fix. Review the additions, complete before/after content, hashes, risk, and diff before using `--apply`. Plans contain original manifest content and cannot be redacted or rendered as Markdown for execution.

Apply checks the canonical workspace and original file contents, rejects links and modified operations, reuses the staged file transaction with rollback, and reruns the root-script check without suppression. A changed input stops the fix; regenerate the plan. Reapplying an already applied plan is unchanged. Textual `fix` suggestions are never executed, and dependency installation or release workflow modification is outside this fixer.

Doctor fix application holds `.repoctl/doctor-fix.lock` through validation, verification, rollback and cleanup. After a crash, confirm no writer remains and reconcile backups before manually removing the lock.

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

## deps catalog check / plan / apply

Inspect default/named catalog references, missing or unused entries, direct-version bypasses,
and migration candidates with `repo deps catalog check --json`. Integrity checks cover all catalogs;
`--catalog <name>` selects the policy for direct declarations and migration candidates.

Preview one dependency section/cohort with
`repo deps catalog plan <dependency> --section devDependencies --json > catalog-plan.json`,
review the linked YAML/manifest changes, then run `repo deps catalog apply catalog-plan.json`.
`--catalog`, `--group` and `--to` choose a named catalog, configured cohort and explicit common
subrange. Planning never writes; apply rejects stale inputs and preserves peer ranges.
See [dependency governance](./dependencies.md) for migration boundaries and pnpm verification.

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

## workspace move

Use `workspace move <exact-name-or-./directory> --to <relative-directory> --name <npm-name> --json` to preview moving, renaming, or both; either option may be omitted. Save the plan outside the target and review consumers, before/after files, blockers and file/line manual tasks. It updates manifest dependencies/aliases/metadata, workspace patterns and explicit supported TypeScript paths while preserving source code. Git-tracked text scanning is bounded, not complete import analysis; resolve manual source/configuration tasks before building. Dirty targets/updated files, existing destinations, duplicate names, symlinks in ancestry, nested workspaces/repos and stale inputs are blocked. Apply only the saved plan with `workspace move --apply <plan.json>`. Failures preserve concurrent edits and report retained recovery files; committed cleanup failures return `cleanupPending`. Run explicit lockfile-only/frozen pnpm installs and affected checks afterward. Published-package renames create a new npm identity; never publish or deprecate as a side effect.

## workspace remove

For removal of one specific existing package, prefer `workspace remove <exact-name-or-./directory> --json`. It always previews, including root/private/transitive consumers. Save the JSON outside the selected directory. Consumers block by default; `--remove-references` plans only exact manifest dependency fields and matching metadata. Review source/configuration candidates manually: the scan covers only Git-tracked text literal matches and is not an exhaustive import analysis. Git HEAD and a clean selected directory are required; ignored files are inventoried. Root/outside/linked/nested-workspace boundaries and uncertain dependency relationships cannot be forced. Apply only a reviewed plan with `workspace remove --apply <plan.json>`. The `.repoctl/workspace-remove.lock` serializes replay checks through verification, rollback and cleanup; after interruption, verify no writer is active and recover retained originals before removing it. Before commit, failures restore manifests and the directory when safe, preserving concurrent edits and reporting recovery paths; after commit, `cleanupPending` reports retained operation files. Run `pnpm install --lockfile-only`, `pnpm install --frozen-lockfile`, workspace checks, and review Git diff explicitly afterward. Do not hand-edit the lockfile or remove user documentation/global skills.

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

## env check

Use `repo env check [tasks...]` to compare static source/example variable names with Turbo hash, passthrough and inferred declarations. Default task: `build`; private packages are included. `--json` and `--markdown` show source locations without values or snippets; `--strict` fails warnings and `--no-framework-inference` disables dependency-based prefix assumptions. The command is always read-only and does not run tasks or load actual dotenv values.

Root/package JSONC configuration, array replacement, `$TURBO_EXTENDS$`, wildcard exclusions and environment-file input coverage are resolved explicitly. Configure `commands.env` task/include/exclude options and reasoned `suppressions` with rule/package/task/variable/path selectors. Dynamic reads and unsupported source syntax remain visible; unused exceptions warn. Static task reachability, aliases, shadowed globals, template expressions, generated code and cross-package source imports are not resolved. Never suggest placing every discovered variable in `globalEnv`; review task-local hash declarations and intentional passthrough separately.

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

### Public API baselines

Use `repoctl package api check --json` after building opted-in `tooling.apiReports` library declarations. Local API Extractor >=7.52.12 <8 is required. `package api update --json` produces a read-only plan; explicitly review it before `package api update --apply <plan.json>`. Preserve existing baselines on check, report failures, review change intents, and never claim API signature differences determine complete SemVer compatibility. Baseline paths are workspace-relative; entries/tsconfig are package-relative.

### Installation security

Use `repo doctor security --json` for a read-only, version-aware pnpm policy report. `--expectations policy.json --strict` checks organization requirements. `--preset balanced` previews only absent supported keys; save the JSON and explicitly use `--apply plan.json` after review. Preserve explicit policies, including release age zero and build approvals. Do not run lifecycle scripts or approve dependencies as part of inspection. Unknown versions/configuration are reported, not treated as safe.

## `repo tooling references`

`check --json` checks existing references without opt-in. `plan` and `sync --dry-run` preview deterministic JSON without writes. With `tooling.projectReferences.enabled: true`, use `sync` or `apply <plan.json>` to maintain only registered references. Existing manual references and TypeScript/Vue validation scripts are preserved; incompatible compiler options, cycles, missing targets and stale plans block application. See [configuration](./config.md#typescript-project-references) for discovery, explicit compilation relationships, ownership and recovery.

### Incremental Playwright capability

Add browser tests to an existing Vue/React Vite application with `build` and `preview` scripts:

```sh
repo tooling capability list --json
repo tooling capability plan playwright --target web --route / --role button --name Increment --expect-text 'Count: 1' --json > e2e-plan.json
repo tooling capability apply e2e-plan.json --json
pnpm install
pnpm --filter @repoctl-e2e/web test:e2e:install
pnpm test:e2e
```

Use `--test-id` instead of `--role`/`--name` for a test-id locator. The route, click and expected text describe a real interaction in your application. The plan shows file diffs, dependencies, scripts, conflicts and next steps, without installing anything. Apply uses those exact reviewed bytes, rejects stale inputs and conflicts, and rolls back failed writes. A repeated unchanged apply has no effect. Choose an empty destination (`--directory`) for the new E2E workspace. Existing application sources and differing generated files are protected.

The capability creates an independent E2E workspace, headless Chromium tests, Turbo build dependencies, a dedicated CI workflow, HTML reports and failure traces. Browser installation is explicit. `--port` and `--ci-port` set distinct local and CI ports. CI never reuses a running service. `--reuse-existing-server` opts into local reuse; Playwright cleans up its own service after success, failure or interruption, and leaves a borrowed service running. Commit the lockfile after installation.

Public APIs: `listToolingCapabilities()`, `planToolingCapability(cwd, options)` and `applyToolingCapability(plan)`. JSON uses schema version 1 and stable English keys regardless of CLI language.

### Optional Storybook for a component library

`repo tooling capability plan storybook --target <exact-workspace> --framework vue|react --component <named-export> --example example.json --json` previews a separate `stories/<slug>` workspace. Apply the reviewed JSON with `repo tooling capability apply plan.json`. The first version supports Vue 3 and React 18/19 libraries with a build script, public entry and an explicit runtime version range. Install dependencies after applying and commit the resulting lockfile. Discovery and planning do not install Storybook or a browser.

A Vue prop-update example is `{"kind":"prop-update","prop":"msg","initial":"Hello Storybook","updated":"Updated component"}`. For a React counter use `{"kind":"click","args":{"initialCount":0},"alternateArgs":{"initialCount":4},"click":{"role":"button","name":"Increase"},"expectText":"1"}`. Component props must be JSON primitives; interaction assertions exercise the selected component. `Default`, `Alternate` and `Interaction` stories provide two states and a play test.

Run `pnpm build:storybook` for the static site, then `pnpm --filter @repoctl-stories/<slug> test:storybook:install` and `pnpm test:storybook` for headless Chromium tests. Turbo builds library dependencies first and records `storybook-static/**`; play tests run without caching and write a JUnit report. Use the generated workspace's `storybook` script for local development. Its independent Vitest and Vite configurations leave the library's existing tests, package exports, runtime dependencies and tarball contents unchanged. Existing stories and configuration are preserved; differing generated files block application and require a new review. No hosted visual testing service is enabled.

## Maintenance

- `repo maintenance upgrade --base <full-sha> --head <full-sha> --out <external-empty-directory>` prepares a root-asset upgrade report and validated patch in a disposable clean checkout, only when the locked root repoctl version changes. Conflicts/failed checks block PR publication.
- `repo maintenance workflow --out .github/workflows/repoctl-upgrade.yml` exports an opt-in two-job recipe without overwriting files. Use only the trusted default branch; keep project execution in the read-only job and acquire the GitHub App write token only after immutable artifact, SHA, path, mode and hash verification. App permissions must include contents, pull requests and workflows write.

Maintenance report hashes describe exact Git blobs; planned working-file bytes are validated before staging. The isolated publisher verifies index bytes and Git-equivalent checkout contents across line-ending conversions, with hooks, executable filters and filesystem monitors disabled through PR creation.

## release snapshot

`repo release snapshot --kind pr --pr <number> --commit <full-HEAD-sha> --build-id <run-attempt> --dry-run --json` previews deterministic temporary versions. Use `--kind nightly` without `--pr` for nightly packages. Without dry-run, archive committed HEAD outside the repository, install frozen dependencies, build, pack and validate isolated consumers. `--output` chooses an external artifact parent. Every public package receives an exact snapshot version and internal references follow those versions. Source manifests/intents/ledger/changelogs/Git refs stay unchanged.

`--publish` requires `REPOCTL_SNAPSHOT_PUBLISH=1` in a trusted same-repository GitHub Actions event whose SHA matches HEAD: `pull_request` for PRs; `schedule` or `workflow_dispatch` for nightly. Fork and `pull_request_target` publication is rejected. Only snapshot tags are used; no GitHub Releases or Git tags are created. Repeat the same identity only for identical artifacts; metadata and tarball integrity are checked before skipping existing versions. Unknown registry state fails closed. Reports retain exact install instructions, artifact paths and validation errors.

## Build contexts and production directories

Preview `repo workspace prepare <exact-name-or-./directory> --mode prune|deploy --out ../empty-output --json`; save the plan outside the source workspace. Apply only after review with `repo workspace prepare --apply ../plan.json`. Prune uses local Turbo 2 and optional `--docker`; deploy uses exact pinned pnpm 10/11/12 with production dependencies, frozen lockfile, disabled lifecycle/pnpmfile hooks, optional `--offline`/explicit `--legacy`, and an existing built `--entry` or manifest main/single bin. Native version-specific injection and peer behavior remains authoritative. No application, image publishing or cloud deployment is executed.

Native commands receive an isolated copy without node_modules, Git/operation/cache directories, real env files or named authentication files. Public .env.example/.env.sample remain. Source symlinks/special files, source-directed native write settings and inventories above 100,000 entries/1 GiB are unsupported. Output must be outside the workspace; links must remain inside the artifact. Publish files exclusively and commit the receipt last. Replays verify source/tool/config fingerprints and complete output; failures preserve concurrent edits and report retained paths. Review cleanupPending and recover partial output before removing a stale .repoctl/workspace-artifacts.lock. Do not hand-edit lockfiles or overwrite nonempty output. On Windows, transfer junction contents with an appropriate copy/archive mode.
