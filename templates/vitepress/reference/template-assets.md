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

## Managed Assets

`repo init` and `repo upgrade` synchronize root scripts, configuration, hooks, and release assets. Existing custom files are preserved unless overwrite behavior is explicitly selected.

Repository maintainers refresh packaged copies with:

```bash
pnpm --filter @icebreakers/monorepo-templates sync:assets
```

Generated copies should never be edited by hand.
