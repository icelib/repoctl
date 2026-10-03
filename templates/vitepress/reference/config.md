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

Share fixed configuration across repositories with [organization preset packages](./organization-presets.md). They contribute JSON configuration, templates, capability recommendations and explicitly managed engineering assets.

```bash
repo config inspect
repo cfg i --json --out reports/config.json
repo cfg i --markdown --redact --out reports/config.md
repo config validate --json
repo config inspect --command ai --set 'format="json"' --set 'force=false' --json
```

Runtime loading validates repoctl-owned fields before CLI actions and before config-consuming APIs write files. Unknown fields, wrong types, invalid enums and conflicting overwrite policies fail with stable diagnostic IDs and field paths. Omit optional fields instead of setting them to `null`. Native ESLint, Stylelint, Commitlint and Vitest overrides, plugin functions and lint-staged callbacks retain their extension boundary. C12 config factories, inherited configurations and environment layers remain supported.

`config validate` is read-only and exits with code 1 on failure. JSON includes `schemaVersion`, `valid`, `file` and `diagnostics`; each diagnostic has `id`, `path`, `actualType`, `expected` and `suggestion`. Evaluation/import failures use `config.load-failed` and do not include arbitrary thrown values. Config files are trusted JavaScript and are evaluated to load them; this command does not sandbox their own code.

`inspect --command` supports `ai`, `clean`, `create`, `deps`, `doctor`, `init`, `mirror`, `release` and `upgrade`. It uses the same option resolver as command execution and adds `effective.values` and per-field `effective.origins` (`default`, `project`, `cli`). Repeated `--set field=JSON` previews config-field overrides without executing the command. Arrays replace the previous array; explicit `false` and empty arrays are retained. These values explain command configuration; use the command's own plan for discovered files, selected packages and runtime-only flags such as `--all`.

Config CLI reports always hide environment maps, scripts, native tool payloads and sensitive keys. `--redact` additionally replaces cwd, config directory and home paths. The programmatic `explainMonorepoConfig` and `validateConfigFile` APIs return safe reports; `loadMonorepoConfigDetails` and the existing `inspectMonorepoConfig` retain runtime objects for code that consumes callbacks. Avoid serializing those raw objects for support reports.

Older generated configs may use `tooling.lintStaged.monorepoCommand`; replace that field with `tooling.lintStaged.repoCommand`. The old name was ignored by the runtime and is now diagnosed instead of silently falling back.

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

The `init` inspection context describes the top-level CLI: its default preset is `standard`, while project configuration and explicit CLI options take precedence. The public `init()` API and `workspace init` retain their metadata-only defaults. Origin paths escape dots and backslashes in dynamic keys with a backslash. Commands that load repoctl configuration validate all repoctl-owned blocks before execution, including blocks unrelated to the selected command.

## `commands.doctor`

Doctor first validates the schema of the whole configuration, then executes only the selected rules. Unselected policies can contain violations without contributing findings, but malformed configuration is always rejected. Omit `rules` to run all rules; use `rules: []` to run none. `config inspect --command doctor` explains the same workspace-root policy that doctor executes, including when invoked from a package directory; explicit CLI selection overrides that policy.

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
