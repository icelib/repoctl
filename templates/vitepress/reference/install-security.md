# Installation security policy

`repo doctor security` inspects persisted pnpm policy and the current process environment without installing dependencies, approving builds, executing lifecycle scripts, or running pnpmfile hooks. It reports release waiting, trust downgrade checks, build decisions and version compatibility. `repo doctor` includes the same checks.

```sh
repo doctor security --json
repo doctor security --pnpm-version 10.26.0 --json
repo doctor security --expectations policy.json --strict --json
repo doctor security --preset balanced > install-policy-plan.json
repo doctor security --apply install-policy-plan.json
```

The audited version comes from an explicit exact version, observed launcher metadata, or the root `packageManager`. Declared-only evidence is a warning. Unknown, prerelease and future unsupported versions do not receive guessed defaults. `--pnpm-version` audits another version; it does not activate it. Applying a plan requires the current resolved version to match the plan.

Policy sources are shown by name, with pnpm version gates. Modern pnpm reads global `config.yaml`, `pnpm-workspace.yaml`, and `PNPM_CONFIG_` environment settings; old npmrc policy and package.json.pnpm declarations are flagged as inactive. Conflicting legacy sources, config dependencies and per-package configuration produce unknown results instead of inferred effective permission. CLI arguments of another pnpm invocation are not observable. External `onlyBuiltDependenciesFile` permissions are not loaded. Configuration interpolation is not expanded.

The JSON `schemaVersion: 1` report has `kind`, `workspaceDir`, `pnpm`, `settings`, `builds`, `checks`, `summary`, and `limitations`. Keys, status values and rule IDs are language independent. Invalid values are omitted; registry credentials, complete config files and Git artifact URLs are never included. Package selectors in policy arrays are reduced to package names; build decisions retain only a selector kind. Organization exception reasons are user-authored report text and should not contain secrets.

Build decisions distinguish allow, deny and pending declarations. `builds.override` describes global script behavior separately; an incompatible allow-all/map combination is unknown. `pendingPackages` means installed packages have not yet been built, which does not necessarily mean approval is missing. `ignoreScripts` does not disable pnpmfile hooks. Reading a report never approves a package.

## Organization expectations

Use `installationSecurity` in `repoctl.config.ts`, or pass the same object in an explicit JSON file:

```ts
export default {
  installationSecurity: {
    minimumReleaseAge: 1440,
    trustPolicy: 'no-downgrade',
    requireBuildApproval: true,
    severity: 'warn',
    exceptions: [
      { key: 'minimumReleaseAgeExclude', package: '@acme/internal', reason: 'Published by the internal release pipeline' },
    ],
  },
}
```

Expectations compare existing policy; they do not change it. A release-age expectation checks disabled waiting, non-strict fallback and missing-time bypass. Trust checks include trusted lockfiles, age cutoffs and the pnpm versions where missing-time bypass also affects trust. Exceptions must match exact pnpm selectors and include a nonblank reason. Missing reasons and unused reasons are visible. Warnings fail with `--strict`; `severity: 'fail'` makes expectation violations fail normally. Unknown fields, malformed expectations and null values are rejected.

Stable rules: `install-security-version`, `install-security-release-age`, `install-security-trust`, `install-security-builds`, `install-security-compatibility`, `install-security-config`, `install-security-expectation`, `install-security-exception`.

## Optional additive preset

The `balanced` preset only proposes absent, supported policy keys: 1440 minutes of release waiting, strict age checks, no missing-time bypass, no trust downgrade, an empty build approval map, disabled allow-all, and strict dependency builds. Existing project/global/environment values remain explicit choices, including a zero release age. Historical approval lists are not mixed with a new map. An explicit allow-all policy prevents adding an incompatible map. This preset is a starting point; it does not override or certify existing policy.

Preview is read-only and includes added keys, preserved keys, a diff and hashes, never the complete YAML. Apply regenerates the exact plan, checks the workspace, version and input hashes, rejects linked inputs and stale plans, then performs an atomic replacement with a backup. Comments and unrelated bytes are retained. A repeated completed application does not write again. Failures before replacement preserve the current file; recoverable failures roll back. A cleanup failure reports that changes were applied and identifies retained backups. Inspect those files before removing them and generate a fresh plan after any manual recovery.

Public APIs: `inspectInstallSecurity`, `planInstallSecurityPreset`, `applyInstallSecurityPreset`, and their exported report/plan/options types. Parent doctor `--markdown`, `--out` and `--redact` options cannot be mixed with this subcommand; use its JSON output explicitly.

References: [pnpm dependency resolution](https://pnpm.io/settings/dependency-resolution), [dependency builds](https://pnpm.io/settings/build), [configuration](https://pnpm.io/configuring), [pnpm 10 settings](https://pnpm.io/10.x/settings).
