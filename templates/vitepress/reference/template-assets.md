---
outline: deep
---

# Template Asset Management

Templates are one repoctl capability. `@icebreakers/monorepo-templates` packages built-in project templates and managed repository assets; templates under `templates/*` are private source workspaces and are not published independently.

## Built-In Mapping

Template metadata defines a stable key, category, source directory, default target, and description. The CLI, create commands, and documentation consume the same registry.

```bash
repo templates
repo templates tsdown
repo templates --category library
```

## Creation Plans

```bash
repo new sdk --template tsdown --dry-run
repo new docs --template nimbus --json --out plans/docs.json
```

A plan records the selected template, source, destination, package name, workspace pattern, and whether fallback behavior was used. Unknown explicit keys fail with a suggestion.

## Health Checks

```bash
repo templates --check
repo templates --check --json
```

Health checks validate unique sources and targets, source directories, package manifests, metadata, and filtered temporary files.

## Discover Custom Templates

Define local templates in `commands.create.templateMap`. Creation, interactive choices, list/detail output and health checks resolve the same catalog, including key, label, description, category, source directory and default target.

```ts
import { fileURLToPath } from 'node:url'
import { defineMonorepoConfig } from 'repoctl'

export default defineMonorepoConfig({
  commands: {
    create: {
      templateMap: {
        'internal-service': {
          source: fileURLToPath(new URL('./templates/internal-service', import.meta.url)),
          target: 'apps/internal-service',
          label: 'Internal service',
          category: 'service',
          description: 'Company API service',
        },
      },
    },
  },
})
```

```bash
repo templates internal-service --json
repo templates --check --json
repo new payments --template internal-service --dry-run
```

Absolute `source` paths allow installed and local templates to coexist. A relative `source` is resolved under `templatesDir`; that directory defaults to the installed template package. Setting `templatesDir: './templates'` replaces the root for every template, including built-ins, and resolves relative to the configuration file directory. Running from a nested pnpm workspace package finds the root configuration without shifting the template root. Generation destinations remain relative to the invocation directory.

String mappings remain supported: `templateMap: { custom: 'custom' }` is equivalent to `{ source: 'custom', target: 'custom' }`. Optional `label`, `description` and `category` add discoverable metadata. A non-empty `choices` array controls interactive order and inclusion; its names and descriptions also appear in list/detail output. Without it, all catalog entries are available. Existing built-in intent defaults are retained; configuring custom templates opens the catalog picker.

Overriding a built-in key is visible through `origin: 'custom'`, `overridesBuiltin: true` and its `configFile`/`configPath`. Invalid definitions and duplicate choices identify their configuration location. `repo templates --check` also detects duplicate sources/targets, missing source directories and missing `package.json`. List JSON remains an array; detail JSON remains an object, with additive catalog fields. Create JSON includes the selected entry as `templateInfo`.

Listing and health checks read declarations and files without generating output or executing template code. `--out` explicitly writes the chosen report. Programmatic consumers can use `resolveTemplateCatalog({ cwd })` and `checkTemplates({ cwd })`.

## Managed Assets

`repo init` and `repo upgrade` synchronize root scripts, configuration, hooks, and release assets. Existing custom files are preserved unless overwrite behavior is explicitly selected.

Repository maintainers refresh packaged copies with:

```bash
pnpm --filter @icebreakers/monorepo-templates sync:assets
```

Generated copies should never be edited by hand.
