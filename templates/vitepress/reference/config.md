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
