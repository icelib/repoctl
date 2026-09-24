# @icebreakers/stylelint-config

- [简体中文指南](./README.zh.md)

## Overview

`@icebreakers/stylelint-config` bundles a Stylelint preset for Vue + SCSS stacks and ships a CLI helper that bootstraps editor settings. It layers sensible defaults (unit allowlists, UnoCSS/Tailwind at-rule ignores, and a built-in Tailwind utility selector ban) on top of the upstream recommended configs, while still letting you toggle specific bundles or append extra rules.

## Requirements

- Node.js 22.13+
- Stylelint 16 (flat-compatible configuration)

## Installation

```bash
pnpm add -D stylelint @icebreakers/stylelint-config
```

For new projects you can scaffold the VS Code integration:

```bash
npx @icebreakers/stylelint-config
```

The CLI will create or update `.vscode/settings.json` with the proper `stylelint.validate` entries so editor diagnostics use Stylelint instead of language servers. It also removes CSS-like languages (`css`, `less`, `scss`, `pcss`, `postcss`) from `eslint.validate` to avoid ESLint and Stylelint fighting over the same file on save.

## Basic Usage

```ts
// stylelint.config.ts
import { icebreaker } from '@icebreakers/stylelint-config'

export default icebreaker({
  miniProgram: true,
})
```

`icebreaker()` accepts the same options as `createStylelintConfig()`, so the
minimal Mini Program setup is a single call with `miniProgram: true`.

## Advanced Configuration

Use `createStylelintConfig` for fine-grained control over preset toggles, ignore lists, and rule overrides:

```ts
import { createStylelintConfig } from '@icebreakers/stylelint-config'

export default createStylelintConfig({
  miniProgram: true,
  formattingPreset: 'safe',
  tailwindcssPreset: 'recommended',
  presets: {
    vue: false, // disable Vue rules for pure SCSS projects
  },
  ignores: {
    units: ['upx'], // replace default list
    addAtRules: ['tailwind'],
  },
  extends: ['@acme/stylelint-config'],
  overrides: [
    {
      files: ['**/*.html'],
      customSyntax: 'postcss-html',
    },
  ],
  rules: {
    'color-hex-length': 'long',
  },
})
```

### Override Or Disable Rules

Rules passed through `rules` are merged after the bundled presets, so a rule
with the same name replaces the built-in value. Use `null` to disable a rule:

```ts
// stylelint.config.ts
import { createStylelintConfig } from '@icebreakers/stylelint-config'

export default createStylelintConfig({
  rules: {
    // Override the built-in warning and report it as an error.
    'property-no-vendor-prefix': true,

    // Replace the default BEM/OOCSS class-name pattern.
    'selector-class-pattern': [
      '^[a-z][a-zA-Z0-9]+$',
      { resolveNestedSelectors: true },
    ],

    // Disable the four utility guards enabled by the default `base` preset.
    'tailwindcss/no-atomic-class': null,
    'tailwindcss/no-invalid-apply': null,
    'unocss/no-atomic-class': null,
    'unocss/no-invalid-apply': null,
  },
})
```

The same `rules` option also works with `icebreaker({ rules: { ... } })`.

### Option Reference

- `miniProgram` – ignore Mini Program build outputs by default: `dist/**`, `.weapp-vite/**`, `node_modules/**`, `miniprogram_npm/**`
- `presets.scss` – include `stylelint-config-standard-scss` (default `true`)
- `presets.vue` – include `stylelint-config-recommended-vue/scss` (default `true`)
- `presets.order` – include `stylelint-config-recess-order` (default `true`)
- `formattingPreset` – enable fix-oriented formatting conventions. Use `'safe'` for a conservative autofix layer, or `'off'` (default) to keep only the linting presets.
- `tailwindcssPreset` – choose the bundled utility-policy layer: `'base'` (default), `'recommended'`, or `'strict'`
- `ignores.*` – replace the default ignore lists (units, selector types, at-rules)
- `ignores.add*` – append to the default ignore allowlists
- `extends` – append additional Stylelint configs after the presets
- `overrides` – pass file-specific overrides (e.g. custom syntax)
- `rules` – merge extra Stylelint rules

Defaults include:

- Allowing BEM/OOCSS class selectors (e.g. `block__element--modifier`, `object--state`)
- Allowing the `rpx` unit for mini-program compatibility
- Lowering `property-no-vendor-prefix` to a warning; Mini Program mode disables the rule so platform-prefixed properties such as `-webkit-background-clip` are allowed
- Ignoring Tailwind/UnoCSS style at-rules (`apply`, `screen`, etc.)
- Disallowing authored Tailwind utility selectors such as `.flex` or `.hover\:bg-red-500`
- Ignoring the `page` selector used by various platforms

### Safe Formatting Preset

If you want Stylelint to own a small set of autofix-friendly formatting
conventions, enable:

```ts
import { createStylelintConfig } from '@icebreakers/stylelint-config'

export default createStylelintConfig({
  formattingPreset: 'safe',
})
```

`formattingPreset: 'safe'` is intentionally conservative. It focuses on rules
that Stylelint 16+ still supports and can fix reliably, such as:

- modern color function notation (`rgba()` -> `rgb(... / ...)`)
- quoted `url(...)` values
- quoted attribute selector values
- collapsing redundant longhand declarations into shorthand
- removing redundant shorthand values

This is not a full Prettier-style formatter. It is a fix-oriented convention
layer for style files that works well with `stylelint --fix`.

### Mini Program Templates

#### Native Template Minimal Config

```ts
import { icebreaker } from '@icebreakers/stylelint-config'

export default icebreaker({
  miniProgram: true,
})
```

Use a script such as:

```bash
stylelint "**/*.{css,scss,wxss,vue}" --fix
```

#### Vue / wevu Template Minimal Config

```ts
import { icebreaker } from '@icebreakers/stylelint-config'

export default icebreaker({
  miniProgram: true,
})
```

This works for `.css`, `.scss`, `.wxss`, and Vue `<style>` blocks without
having to manually wire `postcss-html`, Vue overrides, or Mini Program ignore
paths.

## Tailwind Utility Selector Guard

By default this preset enables the plugin's `base` policy layer:

```txt
tailwindcss/no-atomic-class
tailwindcss/no-invalid-apply
unocss/no-atomic-class
unocss/no-invalid-apply
```

These default rules:

- report Tailwind and UnoCSS utility selectors declared in authored stylesheets while still allowing semantic selectors such as BEM/OOCSS class names
- report invalid utility-like `@apply` candidates

If you want the broader everyday policy layer, switch to:

```ts
import { createStylelintConfig } from '@icebreakers/stylelint-config'

export default createStylelintConfig({
  tailwindcssPreset: 'recommended',
})
```

That adds:

- `tailwindcss/no-apply`
- `tailwindcss/no-arbitrary-value`
- `tailwindcss/no-invalid-theme-function`
- `unocss/no-apply`
- `unocss/no-arbitrary-value`
- `unocss/no-variant-group`

If you want the stricter architecture-oriented Tailwind policy layer, switch to:

```ts
import { createStylelintConfig } from '@icebreakers/stylelint-config'

export default createStylelintConfig({
  tailwindcssPreset: 'strict',
})
```

That adds these Tailwind-only rules on top of the default policy:

- `tailwindcss/no-theme-function`
- `tailwindcss/no-screen-directive`
- `tailwindcss/no-tailwind-directive`
- `tailwindcss/no-import-directive`
- `tailwindcss/no-css-layer`

The underlying plugin supports both Tailwind CSS v3 and v4, and switches automatically based on the installed `tailwindcss` major version in the consuming project. UnoCSS rules discover the nearest `uno.config.*` or `unocss.config.*` and validate with the official generator. Runtime-dependent rules do not guess from class-name prefixes when the corresponding Tailwind runtime or UnoCSS config is unavailable, so semantic names such as `.table-and-form` and `.flex-layout` remain valid. If both runtimes recognize the same selector, the combined preset reports it once.

## Recommended Scripts

- `pnpm --filter @icebreakers/stylelint-config build` to produce the distributable `dist/` bundle.
- `pnpm --filter @app lint:styles` running `stylelint "src/**/*.{css,scss,vue}" --fix`.

## Troubleshooting

- Tailwind directives require `postcss.config.*` to include `@icebreakers/stylelint-config` ignore lists; adjust `ignores.addAtRules` when adding new utilities.
- If Stylelint cannot resolve the preset, ensure your workspace hoists the package or add it to the specific package `devDependencies`.
- Use the generated VS Code settings to avoid duplicate diagnostics from the built-in CSS validation and from ESLint handling CSS files.

## Project links

- Documentation: https://repoctl.icebreaker.top
- Repository: https://github.com/icelib/repoctl/tree/main/packages/stylelint
- Issues: https://github.com/icelib/repoctl/issues
