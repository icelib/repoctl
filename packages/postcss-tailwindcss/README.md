# postcss-tailwindcss

PostCSS AST utilities for analyzing Tailwind CSS syntax.

## Overview

This package focuses on **analysis**, not transformation.

It parses CSS with PostCSS and extracts Tailwind-related structures such as:

- `@apply` utility candidates
- `theme(...)` function calls
- Tailwind v4 `@import "tailwindcss" ...` directives
- utility-like class selectors declared in authored stylesheets
- Tailwind runtime/config installation details from a consumer project

The output is designed for tooling such as:

- Stylelint plugins
- codemods
- custom lint rules
- migration scripts
- editor or CLI diagnostics

## Installation

```bash
pnpm add -D postcss-tailwindcss
```

## When To Use This Package

Use `postcss-tailwindcss` when:

- you already work with PostCSS AST
- you want tolerant parsing for Tailwind syntax
- you need to inspect raw authored CSS rather than compile it
- you need project-aware Tailwind runtime resolution

If your toolchain is already built around Lightning CSS AST, use `lightningcss-tailwindcss` instead.

## API

- `parseTailwindCss(input)`
- `detectTailwindVersion(input)`
- `resolveTailwindRuntime(context)`
- `detectInstalledTailwindVersion(context)`
- `collectApplyCandidates(input)`
- `collectThemeCalls(input)`
- `collectImportDirectives(input)`
- `collectUtilitySelectors(input)`
- `analyzeTailwindCss(input)`

`input` can be a CSS string or an existing PostCSS `Root`.

`context` is:

```ts
interface TailwindResolutionContext {
  cwd: string
  tsconfigPath?: string
}
```

## Example

```ts
import {
  analyzeTailwindCss,
  resolveTailwindRuntime,
} from 'postcss-tailwindcss'

const css = `
@import "tailwindcss" source(none) prefix(tw);

.button {
  @apply flex hover:bg-red-500;
  color: theme(colors.gray.900 / 75%);
}
`

const analysis = analyzeTailwindCss(css)
const runtime = resolveTailwindRuntime({
  cwd: process.cwd(),
})

console.log(analysis.version)
console.log(analysis.applyCandidates.map(item => item.candidate))
console.log(runtime.version)
console.log(runtime.configPath)
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
}
```

Each item keeps a reference to the original PostCSS node so downstream tools can report precise diagnostics.

## Runtime Resolution

`resolveTailwindRuntime()` tries to discover:

- installed `tailwindcss/package.json`
- Tailwind installation directory
- Tailwind CSS style entry
- nearest `tailwind.config.*`
- installed Tailwind version

Resolution is project-aware:

- default Node/package resolution is used first
- if `tsconfigPath` is provided, `paths`/`baseUrl` are also considered via `get-tsconfig`

## Parsing Notes

- Tailwind v3 and v4 syntax are both recognized heuristically
- `theme(colors.gray.900 / 75%)` is normalized into `path` and `opacity`
- escaped selectors such as `.hover\\:bg-red-500:hover` are normalized back to `hover:bg-red-500`
- this package does **not** validate whether a class is truly registered by Tailwind; it only extracts and normalizes syntax

## Relationship To `stylelint-plugin-tailwindcss`

`stylelint-plugin-tailwindcss` uses this package for selector collection and Tailwind runtime resolution.

This package provides the low-level analysis layer; the Stylelint plugin provides the policy and reporting layer.

## Project links

- Documentation: https://repoctl.icebreaker.top
- Repository: https://github.com/icelib/repoctl/tree/main/packages/postcss-tailwindcss
- Issues: https://github.com/icelib/repoctl/issues
