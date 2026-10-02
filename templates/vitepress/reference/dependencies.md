---
title: Dependency consistency
description: Compare workspace dependency declarations and apply reviewed fixes.
---

# Dependency consistency

`repo deps check` reads root and workspace manifests, including private packages. It groups each dependency by its declaration section and configured version cohort. It does not query a registry or choose the newest version.

```bash
pnpm exec repo deps check
pnpm exec repo deps check --json
pnpm exec repo deps plan typescript --section devDependencies --to '^5.7.0' --json > deps-plan.json
pnpm exec repo deps apply deps-plan.json
pnpm install --lockfile-only
pnpm install --frozen-lockfile
```

`deps fix` is an alias for `deps plan`. Planning is always a dry run, including without `--dry-run`. Only `deps apply` changes manifests. Review the JSON before applying it; lockfile updates and installation are separate, explicit pnpm steps.

## Reading the report

| Status         | Meaning                                                     |
| -------------- | ----------------------------------------------------------- |
| `consistent`   | Identical declarations with a known source and range.       |
| `equivalent`   | Different text permits the same versions.                   |
| `compatible`   | Different ranges have a common allowed version.             |
| `conflict`     | There is no version allowed by every declaration.           |
| `uncomparable` | The protocol, source or range cannot be compared reliably.  |
| `managed`      | Workspace references belong to workspace and release rules. |
| `exception`    | An explicit policy exception includes its reason.           |

The report includes every manifest path, workspace directory, original specifier, dependency section, protocol and resolved semver range. Check exits with status 1 for equivalent-text drift, compatible drift or conflicts; exceptions and uncomparable declarations remain visible in the report. JSON keys and status values are stable across locales.

`dependencies`, `devDependencies`, `peerDependencies` and `optionalDependencies` are independent. npm aliases retain their source package; aliases targeting different packages are uncomparable. Default and named catalogs are resolved for comparison, but fixes do not replace catalog references. Workspace, file, link, URL, Git and unknown declarations are report-only. Numeric prereleases follow semver's prerelease rules.

## Intentional version groups

Configure groups in the workspace root's `repoctl.config.ts`, even when invoking the command from a child package:

```ts
import { defineMonorepoConfig } from 'repoctl'

export default defineMonorepoConfig({
  commands: {
    deps: {
      groups: [
        {
          name: 'vue2-adapter',
          workspaces: ['packages/legacy-adapter'],
          dependencies: ['vue'],
          sections: ['dependencies', 'peerDependencies'],
          reason: 'The adapter still supports Vue 2 consumers',
        },
        {
          name: 'canary',
          workspaces: ['examples/canary'],
          dependencies: ['vue'],
          reason: 'Upstream compatibility experiment',
          ignore: true,
        },
      ],
    },
  },
})
```

Workspace selectors are exact relative directories (`.` selects the root), not package-name patterns. Dependencies are exact names. Omit `sections` to match all sections while continuing to compare them independently. Every group needs a unique name and a nonempty reason. Overlapping matches are errors; unmatched occurrences belong to `default`. An ignored group cannot be fixed. Select another cohort with `--group vue2-adapter`.

## Applying and recovering

A plan requires a dependency name, section and explicit target. It accepts compatible plain semver declarations or npm aliases with the same source and protocol. The target must share a common allowed version with the entire selected cohort. Conflicts, unknown protocols and exceptions block planning; split intentional cohorts or perform a separately reviewed incompatible upgrade. No version or major upgrade is selected automatically.

Plans contain exact before/after values, file hashes and hashes of all discovered manifests, workspace settings and local repoctl configuration files. Applying re-discovers the workspace and regenerates the proposed changes. A changed input, new package, tampered diff, linked manifest or partially applied plan is rejected before any new replacement. Plans are bound to the original workspace path.

Only planned manifests are replaced; unrelated fields and dependency sections are retained. An already-applied plan is a no-op. Replacements are staged with original backups and failures roll back completed replacements. If rollback cannot safely overwrite a concurrent edit, the error lists retained `.repoctl-deps-*.bak` files. After a process interruption, inspect those backups beside each manifest, restore originals as needed, remove leftover `.tmp` files, and regenerate the plan. Doctor and pnpm installation can then validate the resulting workspace.

Public APIs are `checkDependencies(cwd)`, `planDependencyFix(cwd, options)` and `applyDependencyFixPlan(cwd, plan)`, exported from `repoctl` with their report, configuration and plan types.
