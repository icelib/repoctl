---
outline: deep
---

# Run checks

## When To Use

Use this task before a commit, before a pull request, or when you need to reproduce the repository's CI plan locally.

## Prerequisites

- Run `repo doctor` from the workspace root.
- Install dependencies with the repository's pinned pnpm version.
- Decide whether you need a fast check or the full delivery gate.

## Smallest Command

```bash
repo check --dry-run
```

## Expected Output

repoctl prints the selected tasks and the exact commands that would run. Remove `--dry-run` only after the plan matches the repository policy.

## Common Branches

- A staged file needs a focused check: use `repo check --staged`.
- CI requires an artifact: add `--json --out reports/check-plan.json`.
- You are preparing a release: use `repo check --full` after the fast check passes.

`repo check` provides stable, task-oriented entrypoints for local and CI verification. It preserves the underlying workspace scripts and reports which commands will run before execution.

## Modes

| Mode           | Command                         | Purpose                                             |
| -------------- | ------------------------------- | --------------------------------------------------- |
| Default        | `repo check`                    | Lightweight pre-commit verification                 |
| Staged         | `repo check --staged`           | lint-staged plus workspace-aware type checking      |
| Full           | `repo check --full`             | Root lint, typecheck, build, test, and tsd workflow |
| Commit message | `repo check --edit-file <file>` | Validate a commit message file                      |

Use `--dry-run`, `--json`, or `--markdown` to inspect the plan without running it. `--out <file>` persists the result and `--redact` removes local paths.

## Pre-Commit

`repo verify pre-commit` runs the repository's staged-file policy. JavaScript, TypeScript, Vue, and style files are routed to the configured lint tasks.

## Staged Type Checking

`repo verify staged-typecheck <files...>` maps changed TypeScript and Vue files to their owning workspace. Vue packages use their `vue-tsc` based typecheck script; TypeScript packages use `tsc`.

## Pre-Push

`repo verify pre-push` discovers packages from `pnpm-workspace.yaml`, including private applications and respecting excluded patterns. It runs the owning package's available `build`, `test`, and `tsd` scripts for changed files, then always runs root `lint` and `typecheck`. Nested packages use the deepest matching directory; the workspace root is not also run as a child package.

Deleted files still trigger their former package. Moving a file between packages checks both directories. Root configuration changes and removed package manifests without a current owner also trigger root `build`, `test`, and `tsd`. This is file ownership selection, not a reverse dependency closure. A newly pushed ref is compared with the empty tree; deleting a ref adds no package tasks.

Programmatic callers can still pass `workspaces` to override discovery, including an empty array. Entries are directories relative to `cwd`, and their order does not affect ownership.

## Automation

```bash
repo check --full --dry-run --json --out reports/check-plan.json
repo check --staged --markdown --redact --out reports/check-plan.md
```

JSON field names and command IDs do not change with `--lang`; only human-readable descriptions do.

## Affected Checks

```bash
repo check --affected --base origin/main --head HEAD --json
repo check --affected --base HEAD~1 --filter @acme/web --dry-run
repo check --affected --global-input 'shared-config/**'
repo check --affected --base origin/main --report reports/affected.json
```

Affected mode selects changed workspace packages and their direct/transitive consumers, including private apps. JSON schema version `1` records the Git range, file ownership, dependency paths, fallback reasons, package selection and skipped tasks. Repeatable `--filter` accepts exact names or workspace-relative directories and intersects the affected set. Empty intersections and missing scripts are explained; they never execute unfiltered recursive commands.

The default range is the merge base of `origin/main` and `HEAD`, through `HEAD`, plus staged, unstaged and untracked files. `--head` must resolve to the current checkout. Missing refs, shallow/incomplete history, a non-current head, unavailable Git or a workspace nested below the Git root explicitly fall back to full checks. Unsafe workspace discovery fails instead of returning an empty plan. Deleted files and both sides of renames retain their owners; package manifest changes, including new/deleted packages, trigger full checks because dependencies may have changed.

Default global inputs cover root package/workspace/lock/Turbo files, TypeScript/lint/test/commit configs, `.npmrc`, `.pnpmfile.*`, Node version files, `.github/**`, `.husky/**`, `scripts/**` and `patches/**`. Turbo `globalDependencies` and repeatable `--global-input` globs are additive. Unknown unowned files trigger full checks. Root Markdown, `docs/**` and license/notice documents are ignored unless a global rule matches; files inside a workspace remain package inputs. An unreadable Turbo config or unresolved graph diagnostics (including catalogs) also trigger full fallback when there are changes. Inspect `globalInputs` and `fallback` in JSON for the exact rules and reasons.

Execution follows `build → lint → typecheck → tsd → test`, skipping unavailable scripts. pnpm recursive commands receive the exact planned filters and handle dependency ordering. Build also includes dependencies outside the affected/filter set, recorded in `prerequisiteTargets`, so tests can use built artifacts. Full fallback uses each existing root script; when a root script is absent, it uses that script across all selected packages. Explicit filters limit checks even during fallback; build prerequisites may still lie outside them. Root scripts are responsible for their own Turbo/pnpm delegation.

`--json`, `--markdown`, `--dry-run` and `--out` remain previews. `--report` executes the same model and embeds it as `affectedPlan`. `--affected` cannot combine with `--full`, `--staged` or `--edit-file`; base/head/filter/global-input options require affected mode. Programmatic callers use `resolveAffectedCheckPlan({ cwd, base, head, filters, globalInputs })` or `runCheckWithReport({ cwd, affected: true, ... })`.

Export this same plan as a GitHub Actions matrix with `repo check --affected --matrix`; use `--shards 16` to group workspaces. See [CI matrix setup](/tasks/ci#generate-an-affected-github-actions-matrix) for empty-result handling and safe argument-array execution.

## Execution Reports

```bash
repo check --full --report reports/check-result.json --redact
repo check --full --report reports/check-result.md --report-format markdown
```

`--report <file>` runs checks and writes the result separately from live terminal logs. It cannot be combined with `--dry-run`, `--json`, `--markdown`, or `--out`, which continue to produce plans only. The default report format is JSON.

JSON schema version `1` records the mode, directory, start/end timestamps, duration in milliseconds, exit code, and each task's executable and argument array. Stable statuses are `success`, `failed`, `skipped`, and `interrupted`. Failed commands stop the sequence; later tasks retain null timestamps/exit codes and a skip reason. The CLI keeps the failing exit code and saves the report on SIGINT/SIGTERM where the operating system allows graceful handling. SIGKILL, abrupt power loss, and an unwritable report destination cannot guarantee a saved report.

Reports capture root script or verification stage results, not the internals of Turbo or lint-staged. In staged mode, configured typechecks run inside pre-commit; the separate staged-typecheck stage has no explicit file arguments and is reported as skipped. Reports do not collect environment values or child output. `--redact` replaces workspace and home path prefixes, including those in command arguments.

The programmatic `runCheckWithReport({ cwd, full: true, signal })` API returns the same report without exiting the caller. An optional `AbortSignal` cancels the active command.

## Find available workspace tasks

`repo workspace tasks` lists actual package scripts, including root tasks and private applications. A package without scripts is shown explicitly. Search text matches names, paths, descriptions and task names literally; `--script` requires an exact script name. Neither discovery nor location runs scripts or writes files.

```bash
repo workspace tasks client
repo workspace tasks --script test --json
repo workspace tasks --no-private --no-root
repo workspace locate @scope/client
repo workspace locate client --json
```

`locate` accepts an absolute directory path (including directory symlinks) as an exact query; an absolute path that is not a workspace root never falls back to text search. Other queries prefer an exact package name or workspace-relative path, then search names, paths and descriptions. Relative paths and `.` refer to the workspace root even when invoked from a child package. A unique match prints only its absolute path. Missing or ambiguous matches exit with code 1; ambiguity lists candidates instead of choosing one. `--interactive` enables a choice only in a TTY, with the prompt on stderr; JSON and CI always report candidates. Quote the resulting path when passing it to a shell command.

The public `getWorkspaceTaskCatalog(cwd, options)` and `locateWorkspace(cwd, query)` APIs return `schemaVersion: 1` data. The catalog includes stable exclusion reasons and each task's existing script plus a pnpm executable/argument array (`--dir`, directory, `run`, task). Callers may explicitly execute that array to preserve pnpm and Turbo behavior; searching never launches it.

## Per-Package Manifest Health

`repo doctor` discovers packages using pnpm workspace patterns (including private and root packages) and reads each manifest independently. An unreadable package.json produces a diagnostic while other packages are still checked. pnpm package.yaml and package.json5 are supported; multiple manifests in one directory require review. Discovery reads fresh files for each API call.

Manifest findings reuse the existing doctor JSON, Markdown, `--strict`, and `--redact` output. Each finding includes a stable `id`, workspace-relative `path`, and `field`. Rules cover missing/invalid/duplicate names, invalid versions and dependency sections, missing/ambiguous workspace targets, self-dependencies, and duplicate/conflicting declarations. Normal peer/dev and peer/runtime pairs are retained; peer compatibility is a separate check. An optional dependency overriding a regular dependency is a warning, since npm permits this explicitly.

Unpublished applications should declare `private: true`. Public package license, repository, repository.directory and publishConfig recommendations are warnings, not mandatory publishing policy; strict mode also fails on warnings. repository.directory is compared against the workspace root, so a workspace embedded in another repository or a separately hosted package requires manual review. Values from invalid JSON and registry credentials are never included in these findings. Doctor neither executes package scripts nor changes manifests. Actual tarball contents and type consumption remain separate package delivery checks.

## Internal dependency boundaries

`repo workspace boundaries --json` inspects the shared manifest graph, including root and private packages. Configure `boundaries` in repoctl.config; configured policies also appear in `repo doctor` JSON/Markdown and its existing CI exit policy. The standalone command exits 1 on failures; `--strict` includes warnings. It never runs tasks, scans source imports, changes dependencies or enforces third-party admission.

```ts
export default {
  boundaries: {
    tags: { shared: { paths: ['packages/**'] }, app: { paths: ['apps/**'] } },
    rules: [
      { id: 'shared-layer', from: { tags: ['shared'] }, allow: [{ tags: ['shared'] }] },
      { id: 'public-packages', from: { private: false }, allow: [{ private: false }] },
    ],
    cycles: { dependencyTypes: ['dependencies', 'optionalDependencies'], severity: 'fail' },
    exceptions: [
      { rule: 'shared-layer', source: 'packages/adapter', target: 'apps/web', type: 'peerDependencies', reason: 'Temporary adapter during migration' },
    ],
  },
}
```

Selectors combine fields with AND and values within one field with OR. `packages` means exact names; `paths` supports exact workspace directories (root is `.`) or `directory/**` for descendants. `./**` includes the entire workspace. Other glob syntax is rejected. Tags are named selectors, cannot reference other tags, and may overlap. A rule's `allow` array is a union; an empty array denies all internal dependencies. Every matching rule applies. Boundary rules include all four dependency fields by default, while cycle detection defaults to dependencies and optionalDependencies only. Configure dependencyTypes to include dev or peer edges; `cycles: false` disables cycles. Semver edges mean possible local relationships, not lockfile installation proof.

Reports contain stable rule IDs, the violated manifest field, endpoints and exact edges. Each cyclic strongly connected component produces one deterministic closed representative chain and its full member list, rather than enumerating every cycle. A cycle exception removes only the exact typed edge; remaining cycles are still checked. Reasons and waived edges remain visible. Unknown fields/tags, invalid paths, duplicate IDs and missing exception reasons fail validation. Unmatched selector alternatives and unused exceptions warn; incomplete internal graph resolution fails so missing relationships are not reported as healthy.

The public `checkWorkspaceBoundaries(cwd, { config? })` returns schemaVersion 1 with findings, exceptions and summary. Explicit API config replaces project configuration for that call. Relative IDs and rule IDs do not change with output language. Put the CLI or `repo doctor --strict` into an existing pnpm CI script; repoctl adds no separate task runner.

## Workspace ownership and CODEOWNERS

Declare exact package names or workspace-relative paths in `repoctl.config.ts`:

```ts
export default {
  codeowners: { owners: { '@acme/web': ['@acme/frontend'], 'libraries/sdk': ['@maintainer'] } },
}
```

`repoctl workspace owners [workspace] --json` reports private and public packages, owners, configuration sources, and missing ownership. Owners accept GitHub users, teams, or email addresses. No network calls verify membership; actual access and review permissions remain managed by GitHub.

```sh
repoctl workspace owners --file .github/CODEOWNERS --dry-run
repoctl workspace owners --file .github/CODEOWNERS --sync
```

A file is always explicit: `.github/CODEOWNERS`, `CODEOWNERS`, or `docs/CODEOWNERS`, relative to the workspace root. Map `.` or the root package name to create a `*` default rule before the more specific child package rules. The default is read-only. `--dry-run` also prevents writes with `--sync`. A marked block preserves outside rules/comments byte for byte. The last matching GitHub rule wins: later rules that may shadow generated paths are reported, including ownerless rules. An existing higher-priority CODEOWNERS file is reported. Unsupported literal directory characters and invalid mappings block sync.

The public `planCodeowners()` / `applyCodeownersPlan()` APIs expose before/after content and a diff, revalidate configuration and workspace inputs, and reject stale plans. Writes replace one file atomically, refuse symlink/hardlink targets, and are idempotent. No messages, review requests, permissions, or branch protection are changed.
Installation policy: see [pnpm installation security](../reference/install-security.md) for release waiting, trust and build approval diagnostics and optional reviewed presets.

## Managed asset upgrade PRs

After a trusted default-branch dependency update, `repo maintenance upgrade --base <full-before-sha> --head <full-current-sha> --out <empty-external-directory>` compares the resolved **root** `repoctl` version in the pnpm lockfile. It understands pnpm 12's separate package-manager document, ignores unrelated dependency and peer-context changes, and blocks unsupported or ambiguous resolutions. The target version must already be installed from the frozen lockfile.

Run preparation in a disposable clean checkout: it applies the complete root upgrade plan and three-way merges, refreshes the lockfile through pnpm, reinstalls with `--frozen-lockfile --ignore-scripts`, then runs declared build, lint, typecheck, tsd and test scripts in that order. The checkout retains the generated changes. Conflicts, changed source inputs, unsupported paths and failed checks leave `report.json` and logs with `blocked` status. No asset diff produces `unchanged`; neither state can create a PR. The report contains every planned file, skips/conflicts, source and target versions, validation results, exact file hashes/modes and the patch digest.

Report file hashes identify exact Git blob bytes. Preparation still checks the planned working-file bytes; publication verifies the patch index and Git-equivalent checkout contents, allowing built-in line-ending conversions. The isolated publisher disables hooks, executable clean/smudge/process filters and filesystem monitors before inspecting files, and retains those settings for PR creation.

Export the opt-in recipe with `repo maintenance workflow --out .github/workflows/repoctl-upgrade.yml`; existing files are never overwritten. Configure a repository GitHub App through `REPOCTL_APP_CLIENT_ID` and `REPOCTL_APP_PRIVATE_KEY`, with **Contents, Pull requests and Workflows: write** permissions, then commit the workflow. The Workflows permission is needed for managed workflow updates; an App token also lets the proposed PR trigger normal CI. No registry token is required.

The first job only has read permissions and can run the trusted checkout's configuration, dependencies and validation scripts. It uploads an immutable artifact. The second job downloads that exact artifact ID, verifies its digest, originating run/attempt/repository, source SHA, allowed root paths, Git modes and before/after hashes, and applies only the reviewed patch. It executes no project scripts or installed dependencies. It then obtains the App token and uses a pinned `create-pull-request` action on the dedicated `repoctl/managed-assets` branch. Repeated events update that branch and PR; reserve it for automation. A moved default branch or missing/insufficient App permissions stops publication. Reports remain in the workflow artifacts for review.

Only default-branch pushes touching `pnpm-lock.yaml` and explicit default-branch manual runs are supported. For a manual retry, provide the full trusted ancestor SHA before the dependency update. Concurrency is serialized per repository/default branch. Fork PR events, automatic merges, registry publication, arbitrary dependency updates, organization asset providers and template instance upgrades are outside this recipe.

## Diagnose Turbo cache misses and slow tasks

Capture evidence with Turbo's existing `pnpm exec turbo run build --summarize`, then analyze an explicit saved summary. The analyzer never invokes tasks, deletes caches or edits configuration:

```sh
repo check cache .turbo/runs/current.json
repo check cache .turbo/runs/current.json .turbo/runs/previous.json --json
repo check cache current.json previous.json --markdown > cache-analysis.md
```

`--slowest 10` selects up to 1–100 tasks. JSON schema version 1 includes known hits/misses, unknown cache outcomes, a hit rate whose denominator excludes unknowns, actual task durations, duration deltas and comparisons keyed by stable task ID. Added and removed tasks are explicit. Missing/duplicate IDs, missing fields and unsupported summary schemas produce limitations; absent evidence never proves an input was removed. Native Turbo summary schema 1 is supported, including a real Turbo 2.11.6 fixture. Future schemas expose coarse recorded data only, with unknown comparisons.

Shared global differences are stored once in `globalEvidence`; task evidence contains only task-specific differences, so report size does not multiply global file count by task count. Comparison evidence covers files, global inputs, dependency task hashes, environment declarations/values, task commands/arguments and resolved task configuration. Every value, including untrusted input hashes, becomes a SHA-256 digest before output; only task IDs, filenames, environment names and allowlisted field names are retained as labels. Raw environment values, commands and arbitrary configuration are never printed. Digest equality is evidence comparison, not proof of a unique cache-miss cause. Unchanged hashes with a miss and opaque changed hashes have explicit limitations. Reports do not include the input summary path.

The dependency critical path is available only with unique tasks, complete dependencies, valid timings, an acyclic graph and no overlapping dependency execution. It reports summed task time separately from the observed span; scheduling gaps and contention prevent treating this as an optimization estimate. Inputs are limited to JSON files of 20 MiB and nesting depth 64. Analysis is read-only; redirect stdout to retain an artifact. Parent execution and plan-writing options (`--full`, `--affected`, `--report`, `--out`, etc.) are rejected; `--json`, `--markdown` and `--dry-run` work before or after `cache`. Normal `check --json` remains a check-plan preview.

Public API: `analyzeTurboRuns(currentPath, { previous?: string, slowest?: number })` returns `TurboRunAnalysis` without changing files. JSON fields and limitation codes remain stable across languages.
