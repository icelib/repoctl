# repoctl.config.ts

Preferred filename: `repoctl.config.ts`

Rule:

- Load `repoctl.config.*`; rename legacy `monorepo.config.*`, which is no longer loaded.
- Validate repoctl-owned fields before command side effects with `repo config validate --json`.
- Native tooling passthrough and callbacks keep their extension boundary. Config modules are trusted executable project code.
- Use `repo config inspect --command ai --set 'format="json"' --json` for shared defaults/project/CLI provenance. Contexts: ai, clean, create, deps, init, mirror, release, upgrade. Runtime selection is explained by each command's plan.
- Reports redact env values and native tool payloads by default; `--redact` additionally hides local paths. For programmatic safe reports use `explainMonorepoConfig` or `validateConfigFile`; runtime config APIs retain callbacks and should not be serialized for sharing.
- Replace the old ignored `tooling.lintStaged.monorepoCommand` field with `repoCommand`.

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
