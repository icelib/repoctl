# Optional Knip checks

Use `pnpm exec repo check knip` only when unused code/dependency analysis is requested.
Ordinary check modes do not enable it. A workspace-root installation of Knip
`>=6.39.0 <7` is required; missing-tool guidance is `pnpm add -Dw knip@^6.39.0`.
repoctl does not download it, fall back to global/parent tools or run native fixes.

1. Inspect `repo check knip --recommend-config` and merge useful native settings manually.
   Preserve existing JSON/JS/TS configuration, plugins and intentional dynamic entries.
   Generated outputs have suggested exclusions; review example/fixture exclusions explicitly.
2. Preview with `repo check knip --dry-run --json`, then run `repo check knip --json`.
   JSON means an actual report on this subcommand. Put all options after `knip`.
3. Use `--production` or `--strict` only after reviewing native production entries.
   Strict mode implies production and checks direct dependency declarations per workspace.
4. Review findings before explicitly saving with `--save-baseline knip-baseline.json`.
   Saving preserves the current exit code and cannot overwrite arbitrary files.
5. Compare with `--baseline knip-baseline.json --new-only` for incremental adoption.
   Do not refresh a baseline silently to hide failures. Baseline errors fail closed.

Reports preserve workspace, source location, native category/reason and warn/error severity.
Exit 0 means the policy passes, 1 means blocking findings, and 2 means incomplete analysis
or invalid baseline. Baseline comparison reports existing, added and fixed findings.
Source line shifts do not create new findings; severity escalation does.

Baseline scope binds the exact tool version, modes, root name, native workspace set,
primary config hashes, categories and enabled plugins. Source/dependency fixes are allowed.
Imported config helpers, environment changes and every plugin auxiliary config are not fully
fingerprinted: review and explicitly rebaseline after changing those policies.
Config paths are relative to invocation cwd; baseline paths are relative to the workspace root.
Review retained temporary paths after interrupted saves or cleanup failures.

Public APIs: `planKnipCheck`, `runKnipCheck`, `getKnipConfigurationSuggestions`,
`saveKnipBaseline`, with exported plan/report/baseline types. Timeout and cancellation fail
closed. Neither repoctl configuration recommendations nor its analyzer runs edit user config.
