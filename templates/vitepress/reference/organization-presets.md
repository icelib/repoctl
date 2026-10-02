# Organization presets

An organization preset is an ordinary npm package containing a `repoctl.preset.json` file. It can share configuration, templates, capability recommendations and a small set of owned engineering files across independent repositories.

Install the package explicitly and keep its exact version in the workspace root `package.json`:

```bash
pnpm add -Dw --save-exact @acme/repoctl-preset@1.2.3
```

```ts
import { defineMonorepoConfig } from 'repoctl'

export default defineMonorepoConfig({
  presets: [{ packageName: '@acme/repoctl-preset', version: '1.2.3' }],
  commands: { clean: { includePrivate: false } },
})
```

The reference, dependency declaration and installed package identity must agree. Ranges and tags are rejected. Loading reads installed JSON only: it does not import the package entrypoint, execute package scripts, install dependencies, fetch templates or write a cache.

## Package contract

Include the manifest and referenced assets in the published package's `files` list:

```json
{
  "schemaVersion": 1,
  "requires": { "repoctl": ">=5.6.0 <6" },
  "config": {
    "commands": {
      "clean": { "includePrivate": true },
      "release": { "qualityScripts": ["build", "lint", "test"] }
    }
  },
  "templates": {
    "acme-sdk": {
      "source": "templates/sdk",
      "target": "packages/sdk",
      "category": "library",
      "label": "Acme SDK"
    }
  },
  "capabilities": [{ "id": "playwright", "reason": "Browser interaction checks" }],
  "assets": [{ "source": "assets/check.mjs", "target": "scripts/acme-check.mjs" }]
}
```

Optional `extends` contains the same exact `{ packageName, version }` references. Each dependency must also have an exact declaration in the preset package's `dependencies` or `devDependencies` and be installed; published presets should use `dependencies` for required parent presets. Dependencies load before their declaring preset, followed by later top-level presets, the existing C12 project configuration, and explicit CLI options. Objects merge and arrays replace at preset boundaries. C12 retains its existing behavior within project configuration. A preset's `config` cannot introduce C12 metadata, further `presets`, `templatesDir` or `templateMap`; use the manifest's `extends` and `templates` fields instead.

Duplicate identical references are reported and applied once. Cycles, different versions of the same package, incompatible `requires.repoctl`, unknown config fields, unsafe asset paths and unsupported capability IDs block consuming commands. Resolution is limited to 64 packages and 16 dependency levels.

```bash
repo presets inspect --json
repo config inspect --json
repo config inspect --command clean --set 'includePrivate=false' --json
repo templates --json
```

Config inspection includes ordered `layers` and per-field `sources` with package names and versions. `effective.sources` explains command values including defaults and CLI overrides. The existing `effective.origins` union remains `default | project | cli`; preset values remain in its project category for compatibility. Config report redaction applies to every layer.

Templates enter the unified catalog in preset order; project template declarations take precedence. Each preset template uses the exact npm identity of the package declaring it. `templates` and `config inspect` only inspect declarations. Use `repo templates fetch acme-sdk` to prepare verified template bytes; actual creation can prepare them as well. A creation preview or `--offline` creation requires a previously verified cache entry. Registry configuration and integrity checks follow the [remote template source contract](./templates.md). The installed config package is not treated as a verified remote template cache.

Capability entries are recommendations. Loading or applying engineering assets does not install or apply capabilities; use the explicit `repo tooling` capability workflow after review.

## Owned engineering files

```bash
repo presets plan --json --out preset-plan.json
repo presets apply preset-plan.json --json
```

Planning is read-only; `--out` exclusively creates a new review file. The plan contains package identities, input fingerprints, exact changes, diffs and ownership records. Applying is explicit, rejects changed inputs and tampered plans, and reapplying an already completed plan is a no-op. Commit `.repoctl/baselines/presets` with the managed files.

Allowed targets are supported root tooling configs, GitHub workflows and issue templates, specific VS Code configs, and engineering scripts. Business code, dependency manifests and internal repoctl metadata cannot be declared as targets. Package-internal symlinks, path traversal and nonportable filenames are rejected. A new preset cannot claim an existing file, even if its bytes match, or take over another preset's or repoctl's baseline. Multiple active presets claiming one target block the whole plan. Choose a new target when ownership is already established; first-version application does not transfer ownership.

To upgrade, explicitly install the new exact package version, update the reference, and review a new plan. The previous upstream baseline enables a three-way merge: nonoverlapping local edits survive; overlapping edits and local deletions block writes. Files removed from a preset declaration remain untouched with their ownership records; deletion or ownership transfer requires separate manual review.

A workspace lock covers validation, staging, writes and rollback. Baselines advance only after their managed files are written. Failure restores previous bytes; concurrent edits and their recovery backups are retained rather than overwritten. If interrupted, preserve `.repoctl-upgrade-*.bak`/`.tmp` files, verify that no writer is active, reconcile the named backups and baselines, and only then remove a stale `.repoctl/upgrade.lock` and create a new plan.

Public APIs are `resolveOrganizationPresets(cwd, references)`, `planOrganizationPresetAssets(cwd)` and `applyOrganizationPresetAssets(plan)`. The first returns structured preset diagnostics; config-consuming APIs map blocking preset diagnostics into configuration validation failures before writes.
