# repoctl.config.ts

Preferred filename: `repoctl.config.ts`

Compatible legacy filename: `monorepo.config.ts`

Rule:

- `repoctl.config.*` has higher priority
- `monorepo.config.*` remains supported
- if both exist at the same time, CLI loading fails fast with an error

Use `defineMonorepoConfig` to set default options for CLI commands.
Only include the fields you need.

Example:

```ts
import { defineMonorepoConfig } from 'repoctl'

export default defineMonorepoConfig({
  commands: {
    ai: {
      baseDir: 'agentic/prompts',
      format: 'md',
      force: false,
      tasksFile: 'agentic/tasks.json',
    },
    create: {
      defaultTemplate: 'tsdown',
      renameJson: false,
      templatesDir: 'packages/monorepo/templates',
    },
    clean: {
      autoConfirm: false,
      dryRun: false,
      ignorePackages: ['docs'],
      includePrivate: true,
      pinnedVersion: 'latest',
    },
    upgrade: {
      skipOverwrite: false,
      targets: ['.github', 'repoctl.config.ts'],
      mergeTargets: true,
    },
    init: {
      skipReadme: false,
      skipPkgJson: false,
      skipChangeset: false,
      skipIssueTemplateConfig: false,
    },
    mirror: {
      env: {
        VSCode_CLI_MIRROR: 'https://example.invalid',
      },
    },
  },
})
```

Key areas:

- ai: default output, format, batch tasks
- create: default template and template directory
- clean: explicit package selection, optional read-only dryRun, private/ignored package filtering, and an explicit pinnedVersion override; existing repoctl versions are retained otherwise
- upgrade: overwrite behavior and extra targets
- init: skip steps for README/package.json/pnpm change intent setup
- mirror: add or override env mirrors

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
