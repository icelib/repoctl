# lightningcss-tailwindcss

Lightning CSS AST utilities for analyzing Tailwind CSS syntax.

## Overview

This package provides a Tailwind-oriented analysis layer on top of **Lightning CSS AST**.

It extracts:

- `@apply` utility candidates
- `theme(...)` calls
- Tailwind import directives
- utility selectors declared in authored stylesheets
- basic Tailwind version hints from parsed syntax
- parser warnings emitted while Lightning CSS recovers invalid or custom syntax

This package is useful when your tooling already depends on Lightning CSS AST and you want to inspect Tailwind-related syntax without switching to PostCSS.

## Installation

```bash
pnpm add -D lightningcss-tailwindcss
```

## When To Use This Package

Use `lightningcss-tailwindcss` when:

- your pipeline already uses `lightningcss`
- you want a fast Rust-backed parser with JS visitor access
- you are comfortable with recovered/normalized AST output

Use `postcss-tailwindcss` instead when:

- you need more permissive authored-source parsing
- you want direct PostCSS node references
- you need project-aware Tailwind runtime/config resolution

## API

- `parseTailwindCss(input)`
- `detectTailwindVersion(input)`
- `collectApplyCandidates(input)`
- `collectThemeCalls(input)`
- `collectImportDirectives(input)`
- `collectUtilitySelectors(input)`
- `analyzeTailwindCss(input)`

## Example

```ts
import { analyzeTailwindCss } from 'lightningcss-tailwindcss'

const css = `
@import "tailwindcss" source(none) prefix(tw);

.button {
  @apply flex hover:bg-red-500;
  color: theme(colors.gray.900 / 75%);
}
`

const result = analyzeTailwindCss(css)

console.log(result.version)
console.log(result.applyCandidates.map(item => item.candidate))
console.log(result.warnings)
```

## Return Shape

`analyzeTailwindCss()` returns:

```ts
interface TailwindAnalysis {
  version: 3 | 4 | 'unknown'
  applyCandidates: UtilityCandidate[]
  themeCalls: ThemeCall[]
  importDirectives: TailwindImportDirective[]
  utilitySelectors: UtilitySelector[]
  warnings: LightningWarning[]
}
```

Unlike the PostCSS version, this package returns Lightning CSS AST fragments and `loc` data rather than PostCSS nodes.

## Parsing Behavior

This package relies on Lightning CSS `transform()` with `errorRecovery: true`.

That means:

- unsupported Tailwind syntax may still be preserved in recovered form
- parser warnings are expected for some Tailwind-specific constructs
- v4 `@import "tailwindcss" source(...) prefix(...)` is analyzable even if Lightning CSS treats parts of it as recovered tokens

## Important Differences From `postcss-tailwindcss`

- No Tailwind runtime resolution helpers
- No PostCSS node references
- More normalized AST output
- Better fit for tools that already consume Lightning CSS visitors

If you need to inspect the consuming project's installed Tailwind runtime or config file, use `postcss-tailwindcss`.

## Project links

- Documentation: https://repoctl.icebreaker.top
- Repository: https://github.com/icelib/repoctl/tree/main/packages/lightningcss-tailwindcss
- Issues: https://github.com/icelib/repoctl/issues
