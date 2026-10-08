# weapp-pandacss

Use [Panda CSS 2.1.2](https://panda-css.com/) in WeChat and other mini-program runtimes.
The package rewrites Panda's generated selectors for mini-program CSS rules while
keeping the normal Panda authoring API intact.

## Install

```bash
pnpm add -D @pandacss/dev@2.1.2 @pandacss/preset-base@2.1.2 @pandacss/preset-panda@2.1.2 weapp-pandacss postcss
```

Add the Panda and weapp plugins to `postcss.config.cjs`:

```js
module.exports = {
  plugins: {
    '@pandacss/dev/postcss': {},
    'weapp-pandacss/postcss': {},
  },
}
```

Configure Panda for ESM runtime files in mini-program projects:

```ts
import { defineConfig } from '@pandacss/dev'

export default defineConfig({
  presets: ['@pandacss/preset-base', '@pandacss/preset-panda'],
  include: ['./src/**/*.{js,jsx,ts,tsx,vue}'],
  outdir: 'styled-system',
  outExtension: 'mjs',
  forceImportExtension: true,
})
```

Generate Panda's runtime and inject the mini-program escape layer together:

```json
{
  "scripts": {
    "prepare": "panda codegen && weapp-panda codegen"
  }
}
```

`weapp-panda codegen` supports both Panda 2's default `helpers.js` and explicit
`helpers.mjs` output. It is safe to run repeatedly; `weapp-panda rollback`
restores the last generated helper backup.

The full Chinese guide and migration notes are in [README.zh.md](./README.zh.md).
The package includes Taro React, Taro Vue, Uni-app Vue, and Vite React examples
under `examples/`.
