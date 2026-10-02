# Configuration

repoctl recommends one root config file:

```txt
repoctl.config.ts
```

`monorepo.config.ts` is no longer loaded at runtime. Rename it to `repoctl.config.ts` before running repoctl.

## Minimal Config

```ts
import { defineMonorepoConfig } from 'repoctl'

export default defineMonorepoConfig({
  commands: {
    create: {
      defaultTemplate: 'tsdown',
    },
  },
})
```

After setting `commands.create.defaultTemplate`, this command can create a package without asking for the template:

```bash
repo new utils
```

## Common Config

```ts
import { defineMonorepoConfig } from 'repoctl'

export default defineMonorepoConfig({
  commands: {
    init: {
      preset: 'standard',
    },
    create: {
      defaultTemplate: 'tsdown',
    },
    clean: {
      autoConfirm: true,
    },
    upgrade: {
      skipOverwrite: true,
    },
  },
})
```

| Option                            | Purpose                                                  |
| --------------------------------- | -------------------------------------------------------- |
| `commands.init.preset`            | Default setup preset                                     |
| `commands.create.defaultTemplate` | Default template for `repo new <name>`                   |
| `commands.clean.autoConfirm`      | Select all eligible packages without prompting           |
| `commands.clean.dryRun`           | Preview deletions and dependency changes without writing |
| `commands.upgrade.skipOverwrite`  | Whether upgrade preserves changed managed files          |

## Inspect Config

```bash
repo config inspect
repo cfg i --json --out reports/config.json
repo cfg i --markdown --redact --out reports/config.md
```

Use `--redact` before sharing reports in issues, PRs, or external support channels.

## Cleaning workspace packages

Use `repo workspace clean --dry-run` to select packages and preview the changes.
For automation, `repo workspace clean --yes --dry-run` previews all eligible
packages. Remove `--dry-run` to execute. Interactive choices start unchecked;
empty selection or cancellation writes nothing. `--yes` respects `ignorePackages`
and `includePrivate`; it never adds repository docs, `.qoder`, or global skills.
Configuration is read from the workspace root even when invoked inside a package.

The JSON preview lists removed directories in `deletions` and root `package.json`
dependency changes with before/after values in `metadata`. Only a nonempty
selection may migrate `devDependencies.@icebreakers/monorepo` and ensure
`devDependencies.repoctl`. Existing repoctl versions are retained unless
`--pinned-version` overrides them; a missing version defaults to `latest`.
An already-correct manifest is not rewritten.

Outside paths, symbolic-link targets or parent paths, linked root manifests,
and deletion of unselected nested packages fail validation before any writes.
The command does not update consumer dependency declarations.

## `commands.doctor`

Configure reasoned waivers under `commands.doctor.suppressions`. Each item needs `id` and a nonempty `reason`; optional `path` matches an exact workspace-relative finding path. Optional `expires` is an inclusive UTC date (`YYYY-MM-DD`). JSON retains the original finding status, `suppression`, `rawSummary`, and every waiver with its matched count. Only active waivers are excluded from effective `summary` and strict exit status; expired and unmatched waivers remain visible.

```ts
export default defineMonorepoConfig({
  commands: {
    doctor: {
      rules: ['root-scripts', 'commit-hooks'],
      suppressions: [{
        id: 'commit-hooks',
        reason: 'CI validates commits while the hooks migration is scheduled',
        expires: '2026-12-31',
      }],
    },
  },
})
```

## TypeScript project references

Check an existing reference graph without enabling writes:

```bash
repo tooling references check --json
repo tooling references plan > references-plan.json
repo tooling references sync --dry-run
repo tooling references apply references-plan.json
repo tooling references sync
```

`check` exits with 1 for diagnostics or pending managed changes. All commands emit versioned JSON. `check`, `plan` and `sync --dry-run` never write. `apply` and `sync` require explicit `tooling.projectReferences.enabled: true`:

```ts
export default defineMonorepoConfig({
  tooling: {
    projectReferences: {
      enabled: true,
      root: 'tsconfig.json',
      projects: ['packages/*/tsconfig.json', 'apps/*/tsconfig.build.json'],
      exclude: ['packages/legacy/tsconfig.json'],
      relations: [
        { source: 'packages/app/tsconfig.json', target: 'packages/shared/tsconfig.json' },
      ],
    },
  },
})
```

The root solution and selected configs must already exist. Without `projects`, discovery selects `tsconfig.json` in each actual pnpm workspace package, including private packages; non-TS packages are skipped. Patterns are workspace-relative and can select multiple configs per package. Exclusions affect managed discovery, not existing manual references. Configs outside workspace packages are not automatically selected. The source workspace's references are never copied into generated projects.

The root aggregates selected projects. Only explicit `relations` add compilation dependencies between them: npm dependencies do not imply a TypeScript reference. TypeScript must be installed in the target workspace. Its compiler reads inherited settings and checks missing targets, reference cycles, `composite`, declaration output and `noEmit` compatibility before writes. repoctl never enables composite, changes compiler options, creates tsconfigs or replaces scripts. The plan lists validation commands, preserving each package's existing `typecheck` script (including `vue-tsc`); run them after synchronization to check actual source files. Planning validates configuration, not a full source compilation.

Existing references remain manually owned. Only newly added entries are recorded in `.repoctl/typescript-references.json`; commit that registry alongside the tsconfigs. Removing or excluding a project removes only entries recorded there. Editing/removing an owned entry blocks synchronization: restore it, or deliberately remove its registry entry to return ownership to the user. JSONC content outside the `references` value, BOM and line endings are preserved. Root aggregation and explicit edges produce stable relative config-file paths.

Saved plans include input fingerprints and exact diffs. Applying a stale or edited plan fails before writes; reapplying an already completed plan is a no-op. A process lock at `.repoctl/typescript-references.lock` covers revalidation, writing, verification, rollback and cleanup. Changes stage together with backups and roll back on failure. If concurrent edits prevent safe rollback, the error names retained recovery files: preserve them, reconcile the business edit with the original backup, restore the ownership registry consistently and generate a new plan. A killed process can also leave `.repoctl-references-*.bak`/`.tmp` files; verify no writer remains, reconcile matching backups and the registry, then remove the stale lock. No recovery action overwrites a concurrent edit automatically.
