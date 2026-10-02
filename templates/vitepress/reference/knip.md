---
title: Unused code and dependencies
description: Explicit native Knip analysis with reviewed baselines.
---

# Unused code and dependencies

`repo check knip` runs the workspace root's installed [Knip](https://knip.dev/) to report unused files, exports and dependencies, plus imports missing from dependency declarations. This is an explicit optional check: ordinary `repo check`, staged, full and affected checks keep their existing behavior.

```bash
pnpm add -Dw knip@^6.39.0
pnpm exec repo check knip --recommend-config
pnpm exec repo check knip --dry-run --json
pnpm exec repo check knip --json
pnpm exec repo check knip --config knip.config.ts --strict
```

Supported versions are `>=6.39.0 <7`. repoctl never downloads Knip, searches a parent/global installation, adds it as a runtime dependency, runs `--fix`, or removes code. Missing or unsupported tools produce installation guidance and fail the check. Native Jiti disk caching is disabled for this command. Native configuration files and plugins execute as they normally do in Knip; only use repository configurations you trust.

## Native configuration

`--recommend-config` prints JSON suggestions for manual merging. It lists existing native configuration files without replacing or writing them. Recommendations cover pnpm workspace entries, library/CLI entrypoints, root tooling scripts and type tests, with explicit generated build, coverage, framework-cache and Worker-type exclusions.

Keep the project's [native configuration](https://knip.dev/reference/configuration) and framework plugins authoritative. Add dynamic imports or convention-based entrypoints through `entry` when a native plugin cannot infer them. Review example/fixture exclusions through native `ignoreFiles` or `ignoreIssues`; examples are not automatically exempted. Rules such as `"exports": "warn"` retain their native severity.

`--production` selects Knip's native production scope. `--strict` also enables production scope and checks dependency declarations per workspace, so dependencies declared only at the root cannot silently stand in for a package's own declarations. Review the native production entries before enabling either mode in CI.

The JSON report includes workspace, file, source location when available, finding category, native diagnostic metadata and `warn`/`error` severity. Native configuration/tag hints are included with their own severities. Exit codes are:

| Code | Meaning                                                                                        |
| ---- | ---------------------------------------------------------------------------------------------- |
| `0`  | The selected policy passes; warnings and accepted baseline findings remain visible.            |
| `1`  | Error findings block the selected policy.                                                      |
| `2`  | Analysis is incomplete, the local tool is unavailable/unsupported, or the baseline is invalid. |

`--json` on **`check knip`** emits the actual analysis. Add `--dry-run` to preview the tool command. These two shared options may appear before or after `knip`; other Knip options belong after the subcommand. Parent `check` execution modes/options cannot be combined with it. `--timeout <ms>` defaults to 120000.

## Reviewed baselines

```bash
# Review current findings, then explicitly create or update a baseline.
pnpm exec repo check knip --save-baseline knip-baseline.json --json
# CI fails only on new error findings; existing, added and fixed remain visible.
pnpm exec repo check knip --baseline knip-baseline.json --new-only --json
```

Saving does not hide the current findings' exit status: a baseline may be saved successfully while the command exits `1`. Ordinary analysis never updates a baseline. `--save-baseline` cannot combine with comparison, new-only, dry-run or recommendation options. Without `--new-only`, comparison still blocks on every current error.

Finding identities include category, severity, workspace, file and symbol; source line shifts alone do not create new issues. Severity escalation is new. Baselines bind the exact Knip version, production/strict modes, root package name, native workspace set, primary configuration hashes, reported categories and enabled plugins. Missing, malformed, duplicate, tampered or incompatible baselines fail closed, including when no current errors are found.

Primary configuration includes the selected file, discovered standard Knip files, root `package.json#knip`, and pnpm workspace package patterns. Source changes and dependency fixes do not invalidate it. Imported configuration helpers, environment-dependent behavior and every plugin's auxiliary configuration cannot be fully fingerprinted; review and explicitly regenerate the baseline after changing those analysis policies.

Baseline output must stay inside the workspace with an existing, unlinked parent. Existing output must already be a valid baseline; configuration files and other arbitrary files cannot be overwritten. New files are created exclusively, updates are staged and checked for concurrent changes, and filesystem failures preserve the prior baseline. Review any retained `.repoctl-knip-*.tmp` paths reported after interruption or cleanup failure before retrying.

The exported APIs are `planKnipCheck(cwd, options)`, `runKnipCheck(cwd, options)`, `getKnipConfigurationSuggestions(cwd)` and `saveKnipBaseline(cwd, report, file)`. Options support `timeoutMs` and `AbortSignal`; incomplete or interrupted analyses cannot be saved. Config paths are relative to `cwd`; baseline paths are relative to the workspace root, including when invoked from a child package.
