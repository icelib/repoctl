---
title: Dependency admission
description: Apply offline team policies to third-party direct dependencies.
---

# Dependency admission

`repo deps policy` reads root and private workspace manifests, evaluates explicit allow/deny rules and never changes manifests or lockfiles. It does not contact registries, inspect transitive dependencies or infer licenses and vulnerabilities.

```bash
pnpm exec repo deps policy
pnpm exec repo deps policy --json > dependency-policy.json
pnpm exec repo deps policy --json --baseline reviewed-policy.json
pnpm exec repo deps policy --strict
```

The exit status is 1 for new failures, and also for new warnings with `--strict`. Without a baseline, every finding is new. A report remains available on stdout when policy violations produce a nonzero exit status. Configuration and input failures produce errors instead of a successful empty report.

## Configure workspace policy

```ts
import { defineMonorepoConfig } from 'repoctl'

export default defineMonorepoConfig({
  dependencyPolicy: {
    rules: [
      {
        id: 'browser-sdk',
        workspaces: ['apps/**'],
        dependencies: ['legacy-sdk', '@obsolete/*'],
        effect: 'deny',
        sections: ['dependencies', 'optionalDependencies'],
        reason: 'The browser applications use the maintained SDK',
        alternative: 'modern-sdk',
      },
    ],
    exceptions: [
      {
        rule: 'browser-sdk',
        workspace: 'apps/legacy-web',
        dependency: 'legacy-sdk',
        section: 'dependencies',
        reason: 'The owning team is migrating this application',
        expiresOn: '2027-01-31',
      },
    ],
  },
})
```

Workspace selectors accept exact package names, exact relative directories, `directory/**`, `.` for the root or `*` for all. An unmatched selector warns. Dependency patterns accept an exact name or `@scope/*`. Sections must explicitly select from `dependencies`, `devDependencies`, `peerDependencies` and `optionalDependencies`. Every rule needs a unique ASCII ID and a reason; `severity` defaults to `fail` and can be `warn`.

Multiple `allow` rules form a union for each workspace and section. `deny` matches either the declaration name or the actual npm alias target. `allow` requires the actual target, so an allowed alias name cannot hide a forbidden package. Explicit simultaneous allow and deny matches produce `admission-conflict`; neither rule order nor exceptions choose a winner.

Default and named pnpm catalogs are resolved before npm aliases. Ambiguous/missing catalog entries and malformed aliases produce `admission-resolution` when the declaration participates in a policy. Explicit `workspace:` and exact file/link references to workspace directories are internal and listed in `skipped`. A plain semver matching a local package is ambiguous without installation proof; change an intended internal declaration to `workspace:`. Other file, Git and URL dependencies are checked by their declaration name, without reading external content. Reports omit raw version strings, URLs and credentials.

The first release reads `package.json` manifests. Unsupported or malformed manifests fail inspection instead of being ignored. Version consistency groups under `commands.deps.groups` are separate from admission and do not alter these rules.

## Exceptions and CI baselines

Exceptions require the exact rule ID, relative workspace directory, declaration key, section and reason. An exception to one allowlist grants an explicit allowance for that declaration. An expiry date is valid through that UTC day; warnings begin seven days before expiry. Expired exceptions no longer waive violations. Unused exceptions warn, and used exceptions remain visible with their reasons.

Commit or otherwise review a complete `--json` report before using it as `--baseline`. The report must have the same policy fingerprint; changing rules or exceptions requires a newly reviewed baseline. Missing, malformed, duplicate or incompatible baseline data fails. `--full` explicitly ignores a supplied baseline and checks all violations. Existing findings remain visible with `baseline: "existing"`, while exit status and `summary.fail`/`warn` count only new findings. A baseline is a reviewed artifact, not a signature or a mechanism for trusting unreviewed PR output.

JSON uses `schemaVersion: 1`, `kind: "dependency-admission"`, stable finding IDs, declaration locations and a policy hash. Findings retain rule reasons and alternatives. `repo doctor` includes full admission checks only when `dependencyPolicy` is configured; it never implicitly loads a baseline.

The public API is `checkDependencyAdmission(cwd, { config?, baseline?, full?, now? })`, returning `DependencyAdmissionReport`. `now` is an optional deterministic clock for integrations. Exported configuration types include `DependencyAdmissionConfig`, `DependencyAdmissionRule` and `DependencyAdmissionException`.
