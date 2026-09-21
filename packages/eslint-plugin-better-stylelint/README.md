# eslint-plugin-better-stylelint

Bridge Stylelint diagnostics into ESLint for style files.

This package provides:

- ESLint processors for `*.css` and `*.scss`
- an ESLint rule for `.vue` files that forwards Stylelint diagnostics from
  `<style>` blocks
- a bundled `synckit` worker so `stylelint.lint()` can be invoked through a
  synchronous ESLint bridge

## Why

Use this when you want style issues to show up in the same ESLint diagnostic
stream as the rest of your project.

## Installation

```bash
pnpm add -D eslint stylelint eslint-plugin-better-stylelint
```

## Usage

```js
import betterStylelint from 'eslint-plugin-better-stylelint'

export default [
  {
    files: ['**/*.css'],
    plugins: {
      stylelint: betterStylelint,
    },
    processor: 'stylelint/css',
  },
  {
    files: ['**/*.scss'],
    plugins: {
      stylelint: betterStylelint,
    },
    processor: 'stylelint/scss',
  },
  {
    files: ['**/*.vue'],
    plugins: {
      stylelint: betterStylelint,
    },
    rules: {
      'stylelint/stylelint': 'error',
    },
  },
]
```

The plugin relies on the consuming project's Stylelint configuration and
prefers the consuming project's `stylelint` installation. If the project does
not provide one, it falls back to the bundled `stylelint` dependency.

## Implementation Notes

- The synchronous bridge is implemented with `synckit`, not by spawning the
  Stylelint CLI.
- The published package must include both `dist/index.js` and `dist/worker.js`.
- `src/core.ts` resolves the worker file by swapping `core.(ts|js)` to
  `worker.(ts|js)`, so removing the worker build entry will break runtime
  resolution.

## FAQ

### Does it automatically read `stylelint.config.js`?

Yes. The bridge calls `stylelint.lint({ code, codeFilename, cwd })` and lets
Stylelint handle config discovery. In practice that means common config entry
points such as `stylelint.config.js`, `stylelint.config.cjs`,
`stylelint.config.mjs`, `stylelint.config.ts`, and `package.json#stylelint`
are discovered by Stylelint itself.

### Does it support `extends`, `plugins`, and `customSyntax`?

Yes, as long as your Stylelint config can resolve them from the project. The
bridge does not bypass or replace Stylelint's normal config loading, so
`extends`, plugin rules, and `customSyntax` continue to work the same way they
would when you run Stylelint directly.

### Which `stylelint` installation does it use?

It prefers the consuming project's own `stylelint` installation. If the
project does not provide one, the bridge falls back to the bundled `stylelint`
dependency shipped with `eslint-plugin-better-stylelint`.

For the most predictable behavior, install `stylelint` in the project root so
your ESLint bridge, Stylelint CLI, and editor integrations all use the same
version.

### Will this affect IDE plugins?

Usually the ESLint extension works as expected, because the bridge runs inside
ESLint. The main thing to watch is consistency:

- If the project has its own `stylelint`, the ESLint bridge and Stylelint IDE
  extension should stay aligned.
- If the project does not have its own `stylelint`, the ESLint bridge can still
  work via the bundled fallback, but a standalone Stylelint IDE extension may
  not behave exactly the same way.

### How does it handle Vue SFCs?

Each `<style>` block in a `.vue` file is linted separately. The bridge:

- extracts the block content instead of linting the whole SFC as one string
- generates a virtual filename based on the block `lang`, such as `css` or
  `scss`
- maps Stylelint diagnostics back to the original `.vue` line and column
- includes block context such as `scoped`, `module`, and `lang` in the message
  when that context helps identify the source block

## Project links

- Documentation: https://repoctl.icebreaker.top
- Repository: https://github.com/icelib/repoctl/tree/main/packages/eslint-plugin-better-stylelint
- Issues: https://github.com/icelib/repoctl/issues
