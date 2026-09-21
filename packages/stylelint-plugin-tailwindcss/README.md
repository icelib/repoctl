# stylelint-plugin-tailwindcss

Stylelint plugin for teams that do not want authored CSS to drift toward
utility-first styles.

It focuses on two related policies:

- do not declare utility selectors such as `.flex`, `.grid`, `.text-center`,
  or `.hover\:bg-red-500` in authored CSS
- control utility-oriented directives such as `@apply`, `theme(...)`,
  `@screen`, and similar Tailwind syntax when your team wants stricter
  stylesheet conventions

Although the package name is Tailwind-oriented, it also ships a parallel
`unocss/*` namespace so the same stylelint workflow can still be useful in
UnoCSS-style projects.

## Installation

```bash
pnpm add -D stylelint stylelint-plugin-tailwindcss
```

Runtime-aware rules validate against the consuming project instead of guessing
from class-name prefixes. Tailwind rules resolve the installed `tailwindcss`
v3 or v4 runtime. UnoCSS rules discover the nearest `uno.config.*` or
`unocss.config.*` and use the official UnoCSS generator. If the corresponding
runtime or config is absent, those rules conservatively produce no match.

## Quick Start

Use the default recommended preset:

```ts
// stylelint.config.ts
import { recommended } from 'stylelint-plugin-tailwindcss'

export default recommended
```

Use the minimal base preset:

```ts
import { base } from 'stylelint-plugin-tailwindcss'

export default base
```

Use only one namespace:

```ts
import {
  tailwindRecommended,
  tailwindStrict,
  unocssRecommended,
  unocssStrict,
} from 'stylelint-plugin-tailwindcss'

export default tailwindRecommended
// or
export default unocssRecommended
// or
export default tailwindStrict
// or
export default unocssStrict
```

Disable one namespace while keeping the other:

```ts
import { recommended } from 'stylelint-plugin-tailwindcss'

export default {
  ...recommended,
  rules: {
    ...recommended.rules,
    'unocss/no-atomic-class': false,
    'unocss/no-invalid-apply': false,
    'unocss/no-apply': false,
    'unocss/no-arbitrary-value': false,
    'unocss/no-variant-group': false,
  },
}
```

## Presets

### `base`

Lowest-noise starting point. It only enables the core selector and invalid
`@apply` checks for both namespaces.

- `tailwindcss/no-atomic-class`
- `tailwindcss/no-invalid-apply`
- `unocss/no-atomic-class`
- `unocss/no-invalid-apply`

### `recommended`

Default preset. It enables both namespaces, but only the lower-noise rules that
work well as a general recommendation.

Tailwind rules:

- `tailwindcss/no-atomic-class`
- `tailwindcss/no-invalid-apply`
- `tailwindcss/no-apply`
- `tailwindcss/no-arbitrary-value`
- `tailwindcss/no-invalid-theme-function`

UnoCSS rules:

- `unocss/no-atomic-class`
- `unocss/no-invalid-apply`
- `unocss/no-apply`
- `unocss/no-arbitrary-value`
- `unocss/no-variant-group`

### `tailwindBase`

Tailwind-only version of `base`.

### `tailwindRecommended`

Tailwind-only version of `recommended`.

### `strict`

Highest policy layer. It adds the more architecture-oriented Tailwind rules on
top of `recommended`.

Tailwind rules:

- `tailwindcss/no-atomic-class`
- `tailwindcss/no-invalid-apply`
- `tailwindcss/no-apply`
- `tailwindcss/no-arbitrary-value`
- `tailwindcss/no-theme-function`
- `tailwindcss/no-invalid-theme-function`
- `tailwindcss/no-screen-directive`
- `tailwindcss/no-tailwind-directive`
- `tailwindcss/no-import-directive`
- `tailwindcss/no-css-layer`

UnoCSS rules:

- `unocss/no-atomic-class`
- `unocss/no-invalid-apply`
- `unocss/no-apply`
- `unocss/no-arbitrary-value`
- `unocss/no-variant-group`

### `tailwindStrict`

Tailwind-only version of `strict`.

### `unocssBase`

UnoCSS-only version of `base`.

### `unocssRecommended`

UnoCSS-only version of `recommended`.

### `unocssStrict`

UnoCSS-only version of `strict`.
At the moment it is intentionally the same as `unocssRecommended`.

## What Gets Reported

Reported utility selectors include examples such as:

- `.flex`
- `.grid`
- `.text-center`
- `.hover\:bg-red-500`
- `.md\:flex`
- `.\!mt-4`
- `.w-\[10px\]`

Semantic selectors such as these are not treated as utility selectors:

- `.page-shell`
- `.card__body`
- `.hero-banner--primary`
- `.table-and-form`
- `.flex-layout`
- `.rounded-card`

## Detection Modes

### Tailwind runtime

When the consuming project installs Tailwind, the plugin resolves that project’s
own `tailwindcss` package and validates against the real runtime.

If Tailwind cannot be resolved from the linted file, runtime-dependent rules
such as `tailwindcss/no-atomic-class` and `tailwindcss/no-invalid-apply` do not
guess from utility-like prefixes.

### UnoCSS runtime

UnoCSS rules search upward from the linted file for `uno.config.*` or
`unocss.config.*`, then validate candidates with `@unocss/core`. Without a
config, runtime-dependent UnoCSS rules produce no match.

When both namespaces recognize the same authored selector, the combined presets
report it once.

## Rule Reference

### Tailwind rules

- `tailwindcss/no-atomic-class`
  Reports authored utility selectors.
- `tailwindcss/no-invalid-apply`
  Reports `@apply` candidates that look utility-like but are not recognized as
  valid Tailwind utilities.
- `tailwindcss/no-apply`
  Reports every `@apply` directive.
- `tailwindcss/no-arbitrary-value`
  Reports Tailwind-style arbitrary values and arbitrary properties in selectors
  and `@apply`, such as `w-[10px]` and `[mask-type:luminance]`.
- `tailwindcss/no-invalid-theme-function`
  Reports `theme(...)` calls whose lookup path is invalid for the resolved
  Tailwind runtime.
- `tailwindcss/no-theme-function`
  Reports all `theme(...)` calls. Exported, but not enabled by
  `recommended`.
- `tailwindcss/no-screen-directive`
  Reports `@screen`. Exported, but not enabled by `recommended`.
- `tailwindcss/no-tailwind-directive`
  Reports `@tailwind`. Exported, but not enabled by `recommended` because it is
  better suited to migration or architecture-specific presets.
- `tailwindcss/no-import-directive`
  Reports `@import "tailwindcss"`-style entry imports. Exported, but not
  enabled by `recommended` because it is better suited to migration or
  architecture-specific presets.
- `tailwindcss/no-css-layer`
  Reports authored `@layer` directives. Exported, but not enabled by
  `recommended` because it can also match native CSS cascade layers.

### UnoCSS rules

- `unocss/no-atomic-class`
  Reports authored utility selectors.
- `unocss/no-invalid-apply`
  Reports `@apply` candidates that look utility-like but are not recognized as
  valid candidates by the discovered UnoCSS config and official generator.
  It is intentionally narrower than `unocss/no-apply`: semantic tokens such as
  `button-base` are ignored, while misspelled utility-like tokens such as
  `bg-rd-500` are reported.
  Bare-value forms such as `w-10px` and `text-rgb(255,0,0)` can also be
  reported here when they fail the validity check.
- `unocss/no-apply`
  Reports every `@apply` directive.
- `unocss/no-arbitrary-value`
  Reports UnoCSS-style arbitrary values in selectors and `@apply`.
  This includes bare-value forms such as `w-10px`, `w-50%`, `top--10px`,
  `bg-$brand`, `text-rgb(255,0,0)`, `translate-x-50%`, `outline-#fff`, and
  `[&>*]:w-10px`.
- `unocss/no-variant-group`
  Reports UnoCSS variant groups such as `hover:(bg-red-500 text-white)`.

## Exported Names

The package exports:

- preset objects such as `base`, `recommended`, `tailwindRecommended`, and
  `unocssRecommended`
- rule names such as `noAtomicClassRuleName` and
  `unocssNoVariantGroupRuleName`
- plugin instances such as `noAtomicClassPlugin` and
  `unocssNoVariantGroupPlugin`

If you need fine-grained composition, import the individual rule names and
plugins directly.

## With `@icebreakers/stylelint-config`

`@icebreakers/stylelint-config` already wires this plugin in. If you use that
preset, you usually do not need to register this package manually.

## Supported File Types

The plugin works anywhere Stylelint works, including:

- `.css`
- `.scss`
- Vue SFC `<style>`
- Vue SFC `<style lang="scss">`

## Demo

This repository includes IDE-friendly examples under
[`apps/mock/src/stylelint-demo`](/Users/yangqiming/Documents/GitHub/eslint-config/apps/mock/src/stylelint-demo).

## More

The stricter preset is documented in
[`docs/strict-preset.md`](/Users/yangqiming/Documents/GitHub/eslint-config/packages/stylelint-plugin-tailwindcss/docs/strict-preset.md).

## Project links

- Documentation: https://repoctl.icebreaker.top
- Repository: https://github.com/icelib/repoctl/tree/main/packages/stylelint-plugin-tailwindcss
- Issues: https://github.com/icelib/repoctl/issues
