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

## Execution Reports

```bash
repo check --full --report reports/check-result.json --redact
repo check --full --report reports/check-result.md --report-format markdown
```

`--report <file>` runs checks and writes the result separately from live terminal logs. It cannot be combined with `--dry-run`, `--json`, `--markdown`, or `--out`, which continue to produce plans only. The default report format is JSON.

JSON schema version `1` records the mode, directory, start/end timestamps, duration in milliseconds, exit code, and each task's executable and argument array. Stable statuses are `success`, `failed`, `skipped`, and `interrupted`. Failed commands stop the sequence; later tasks retain null timestamps/exit codes and a skip reason. The CLI keeps the failing exit code and saves the report on SIGINT/SIGTERM where the operating system allows graceful handling. SIGKILL, abrupt power loss, and an unwritable report destination cannot guarantee a saved report.

Reports capture root script or verification stage results, not the internals of Turbo or lint-staged. In staged mode, configured typechecks run inside pre-commit; the separate staged-typecheck stage has no explicit file arguments and is reported as skipped. Reports do not collect environment values or child output. `--redact` replaces workspace and home path prefixes, including those in command arguments.

The programmatic `runCheckWithReport({ cwd, full: true, signal })` API returns the same report without exiting the caller. An optional `AbortSignal` cancels the active command.
