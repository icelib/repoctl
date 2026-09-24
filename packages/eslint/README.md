# @icebreakers/eslint-config

- [简体中文指南](./README.zh.md)

## Overview

`@icebreakers/eslint-config` extends the `@antfu/eslint-config` flat presets and layers extra rules for Tailwind CSS, MDX, Vue accessibility, and Icebreaker specific TypeScript defaults. It returns a `FlatConfigComposer`, so you can opt into only the presets you need and keep adding workspace specific overrides.

## Requirements

- Node.js 22 or newer
- ESLint 9 with flat config support
- React core plugins are bundled with this package. Next.js, Query, accessibility, Astro, Svelte, and other ecosystem presets remain optional and are skipped automatically when their plugins are missing.
- Wevu compatibility checks are bundled and require no additional install. Install optional plugins when you turn on Tailwind (`eslint-plugin-tailwindcss` or `eslint-plugin-better-tailwindcss`), MDX (`eslint-plugin-mdx`), UnoCSS (`@unocss/eslint-plugin`), the Stylelint bridge (`eslint-plugin-better-stylelint`), React accessibility (`eslint-plugin-jsx-a11y`), Vue accessibility (`eslint-plugin-vuejs-accessibility` plus its `globals` peer), Astro (`eslint-plugin-astro` and `astro-eslint-parser`), or Svelte (`eslint-plugin-svelte`, `svelte-eslint-parser`, and `svelte`). XML/SVG formatting needs `@prettier/plugin-xml`; Astro formatting needs `prettier-plugin-astro`.

## Installation

```bash
pnpm add -D eslint @icebreakers/eslint-config
```

## Quick Start

Create `eslint.config.ts` (or `.mjs`) in your project root:

```ts
import { icebreaker } from '@icebreakers/eslint-config'

export default icebreaker()
```

Run ESLint via your package manager:

```bash
pnpm eslint "src/**/*.ts"
```

If you need the legacy array config, call `icebreakerLegacy()` instead.

## Enabling Presets

Each optional preset mirrors the flags in `@antfu/eslint-config` and adds Icebreaker tweaks:

```ts
import { icebreaker } from '@icebreakers/eslint-config'

export default icebreaker({
  vue: true, // or { vueVersion: 2 }
  react: true,
  query: true,
  typescript: true,
  test: true,
  tailwindcss: true,
  betterTailwindcss: {
    entryPoint: './src/tailwind.css',
    rules: 'recommended',
  },
  unocss: {
    strict: true,
  },
  mdx: process.env.LINT_MDX === 'true',
  a11y: true,
  nestjs: true,
  ionic: true,
  miniProgram: true,
  formatters: true,
})
```

- `miniProgram` – injects Mini Program globals, ignores common outputs/config files, enables Vue-side Mini Program compatibility tweaks when `vue` is on, and loads the bundled `@weapp-vite/eslint` compatibility checks.
- `vue` – enables Vue + optionally version specific overrides (Vue 2/3) and ionic/miniProgram adjustments.
- `react` – defers to the upstream React preset. The required React core lint plugins are bundled with this package; React accessibility still requires `eslint-plugin-jsx-a11y` when `a11y` is enabled.
- `query` – toggles the TanStack Query plugin (`@tanstack/eslint-plugin-query`) and its recommended lint rules. Missing plugin installs are treated as a no-op.
- `tailwindcss` – pass `true` to enable `eslint-plugin-tailwindcss`.
- `betterTailwindcss` – pass `true` or `{ entryPoint, tailwindConfig }` to enable `eslint-plugin-better-tailwindcss` for Tailwind v4/v3 projects. Object mode defaults to fast syntax checks (`no-duplicate-classes` and `no-unnecessary-whitespace`) and scopes relative entry points to their source directory; set `rules: 'recommended'` to opt into the full recommended preset.
- `unocss` – pass `true` to use the upstream Antfu UnoCSS preset, or provide `{ strict, attributify, configPath }` to keep the same preset while using the Icebreaker wrapper API.
- `mdx` – activates MDX linting via `eslint-plugin-mdx`.
- `astro` – enables the upstream Astro preset. Install `eslint-plugin-astro` and `astro-eslint-parser`; missing installs are skipped.
- `svelte` – enables the upstream Svelte preset. Install `eslint-plugin-svelte`, `svelte-eslint-parser`, and `svelte`; missing installs are skipped.
- `stylelint` – bridges Stylelint diagnostics into ESLint for `*.css`, `*.scss`, and Vue `<style>` blocks. Requires `eslint-plugin-better-stylelint`; missing installs are skipped.
- `a11y` – wires in JSX (React) and Vue accessibility plugins. Missing framework-specific plugins are skipped independently.
- `typescript` – extends the TypeScript preset and applies stricter unused diagnostics. Pair with `nestjs` for Nest specific adjustments.
- `nestjs` – enables NestJS-centric TypeScript tweaks (empty decorated constructors, declaration merging, DI parameter properties, etc.).
- `formatters` – keeps the built-in formatting rules enabled by default, including CSS/SCSS/Less formatting through `eslint-plugin-format`.
- `test` – relaxes certain Vitest/Jest style rules (`test/prefer-lowercase-title`).
- `weapp` – legacy alias for `miniProgram`; kept for backward compatibility.

### Formatter Engines

`@icebreakers/eslint-config` still uses `eslint-plugin-format` as the formatter
bridge. The default formatter path stays aligned with the upstream Prettier
setup. Icebreaker still lets you opt specific file types into `oxfmt` when you
want to experiment or tune a project explicitly:

```ts
import { icebreaker } from '@icebreakers/eslint-config'

export default icebreaker({
  formatters: {
    css: 'oxfmt',
    html: 'oxfmt',
    markdown: 'oxfmt',
    graphql: 'oxfmt',
    oxfmtOptions: {
      lineWidth: 100,
    },
  },
})
```

Support matrix:

- default: CSS/SCSS/Less, HTML, GraphQL, and Markdown stay on the upstream
  Prettier path. XML/SVG also stay on Prettier when `@prettier/plugin-xml` is
  installed; Astro formatting stays on Prettier when `prettier-plugin-astro` is
  installed; Slidev stays on Prettier when `@slidev/cli` is present.
- `css: 'oxfmt'` also switches SCSS and Less to `format/oxfmt`
- `html: 'oxfmt'` switches HTML to `format/oxfmt`
- `markdown: 'oxfmt'` switches Markdown to `format/oxfmt`
- `graphql: 'oxfmt'` switches GraphQL to `format/oxfmt`

Current limits:

- This is not a full `format/prettier` to `format/oxfmt` migration layer
- `markdown: 'oxfmt'` cannot be combined with `formatters.slidev`
- `oxfmtOptions` are passed directly to `format/oxfmt`

### Mini Program Preset

`miniProgram: true` is the recommended API for `weapp-vite`, `wevu`, and native
Mini Program templates. It enables the following defaults:

- injects readonly globals for `wx`, `Page`, `App`, `Component`, `getApp`, `getCurrentPages`, `requirePlugin`, and `WechatMiniprogram`
- ignores `dist/**`, `.weapp-vite/**`, `miniprogram_npm/**`, `node_modules/**`, `project.config.json`, and `project.private.config.json`
- when `vue: true` is also enabled, disables `vue/no-deprecated-slot-attribute`, `vue/no-useless-template-attributes`, and `vue/singleline-html-element-content-newline` so native Mini Program slot projection and compiler-only slot attributes are allowed, and warns when Vue props are named `id`, `class`, or `slot` because Mini Program `properties` may not receive those values reliably
- reports unsupported Vue, Pinia, and Vue Router APIs as errors, risky APIs as warnings, and traceable `RouterLink` template usage as an error through the bundled `@weapp-vite/eslint` preset

#### Native Mini Program Minimal Config

```ts
import { icebreaker } from '@icebreakers/eslint-config'

export default icebreaker({
  miniProgram: true,
})
```

#### weapp-vite + wevu Minimal Config

```ts
import { icebreaker } from '@icebreakers/eslint-config'

export default icebreaker({
  miniProgram: true,
  vue: true,
})
```

#### Combining With Existing Options

```ts
import { icebreaker } from '@icebreakers/eslint-config'

export default icebreaker({
  miniProgram: true,
  vue: true,
  tailwindcss: true,
  ignores: ['coverage/**'],
})
```

`miniProgram` adds the platform defaults and the bundled Wevu compatibility
config. User supplied `ignores`, `extends`, `rules`, and downstream flat config
items still compose normally and can override the recommended rule levels.

### Stylelint Bridge

The Stylelint bridge is disabled by default and is not bundled. Install
`eslint-plugin-better-stylelint` first, then turn it on with `stylelint: true`.
When enabled, it uses `@icebreakers/stylelint-config` as the default Stylelint
preset and lints `*.css`, `*.scss`, and `.vue` style blocks through ESLint:

```bash
pnpm add -D eslint-plugin-better-stylelint
```

```ts
import { icebreaker } from '@icebreakers/eslint-config'

export default icebreaker({
  vue: true,
  stylelint: true,
})
```

You can also inline Stylelint preset options directly in `eslint.config.ts`:

```ts
import { icebreaker } from '@icebreakers/eslint-config'

export default icebreaker({
  vue: true,
  stylelint: {
    cwd: process.cwd(),
    presets: {
      order: false,
    },
    rules: {
      'color-named': 'never',
    },
  },
})
```

`stylelint.cwd` changes the resolution root, and the remaining fields follow
the `@icebreakers/stylelint-config` options (`presets`, `tailwindcssPreset`,
`ignores`, `extends`, `overrides`, `rules`).

The ESLint bridge surfaces Stylelint diagnostics, but it does not replace a
full standalone Stylelint workflow. If you want Stylelint CLI, editor-native
Stylelint integration, or dedicated `stylelint --fix` runs, install `stylelint`
and `@icebreakers/stylelint-config` in the consuming project as well.

Recommended consumer scripts:

```json
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "lint:styles": "stylelint \"src/**/*.{css,scss,vue}\"",
    "lint:styles:fix": "stylelint \"src/**/*.{css,scss,vue}\" --fix"
  }
}
```

Use `lint:fix` when you want a single ESLint-driven formatting pass, including
CSS-family files via `formatters`. Add the separate Stylelint scripts when you
want the full Stylelint toolchain on top.

### UnoCSS Projects

The UnoCSS integration is still powered by the upstream Antfu preset, but
`@icebreakers/eslint-config` adds a small wrapper so the config file path can be
declared next to the other UnoCSS options:

```ts
import path from 'node:path'
import { icebreaker } from '@icebreakers/eslint-config'

export default icebreaker({
  unocss: {
    strict: true,
    attributify: false,
    configPath: path.resolve(process.cwd(), './uno.config.ts'),
  },
})
```

Behavior details:

- `unocss: true` enables the upstream Antfu UnoCSS preset unchanged.
- `unocss.configPath` is an Icebreaker wrapper for `settings.unocss.configPath`.
- If `configPath` is omitted, UnoCSS still searches the lint project root for
  `uno.config.*`.
- If both `unocss.configPath` and `settings.unocss.configPath` are provided,
  `unocss.configPath` wins.
- If `@unocss/eslint-plugin` is unavailable, the UnoCSS preset is skipped
  instead of throwing.

### NestJS Projects

Enable `nestjs: true` together with the TypeScript preset to apply rules tailored for Nest idioms:

- Keeps decorated lifecycle hooks and class constructors legal even when empty.
- Allows DI parameter properties and ambient module augmentation (e.g. Express request typing).
- Relaxes `no-explicit-any`/`ban-types` patterns commonly used with provider tokens while keeping other strict defaults intact.

## Adding Extra Config Items

Because `icebreaker()` returns a composer you can append overrides:

```ts
import { icebreaker } from '@icebreakers/eslint-config'

export default icebreaker(
  { typescript: true },
  {
    files: ['*.vue'],
    rules: {
      'vue/no-undef-components': 'off',
    },
  },
)
```

You may also pass other flat configs (e.g. from in-house presets) as additional arguments.

## IDE Integration

- Install the VS Code ESLint extension (`>=3.0.10`).
- Set `"eslint.experimental.useFlatConfig": true` for older VS Code builds.
- Use `lint:fix` for the default ESLint-driven formatting flow, including
  CSS/SCSS/Less. Add `lint:styles:fix` when your project also uses standalone
  Stylelint runs.
- If you opt specific file types into `oxfmt`, the same `eslint --fix` flow
  continues to work. Only the formatter engine changes.

## Troubleshooting

- Missing plugin errors usually mean a feature is enabled without its optional dependency being installed in the current workspace. React, Next, and UnoCSS related presets now auto-skip in that case; other features can be added with `pnpm add -D`.
- When combining legacy `.eslintrc` projects, prefer `icebreakerLegacy()` and move overrides into flat config format incrementally.
- Tailwind class validation reads from your `tailwind.config.*`; double check the path when using monorepo roots or custom build tooling.

## Project links

- Documentation: https://repoctl.icebreaker.top
- Repository: https://github.com/icelib/repoctl/tree/main/packages/eslint
- Issues: https://github.com/icelib/repoctl/issues
