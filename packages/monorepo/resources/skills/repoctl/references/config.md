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

## `commands.doctor`

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

Configure reasoned waivers under `commands.doctor.suppressions`. Each item needs `id` and a nonempty `reason`; optional `path` matches an exact workspace-relative finding path. Optional `expires` is an inclusive UTC date (`YYYY-MM-DD`). JSON retains the original finding status, `suppression`, `rawSummary`, and every waiver with its matched count. Only active waivers are excluded from effective `summary` and strict exit status; expired and unmatched waivers remain visible.
