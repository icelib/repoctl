import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts', 'src/tooling-entry.ts', 'src/docs-context-entry.ts'],
  shims: true,
  format: ['esm'],
  clean: true,
  dts: true,
  // https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing_assignment
  target: 'node20',
  // https://github.com/egoist/tsdown/pull/1056
  // https://github.com/egoist/tsdown/issues?q=cjsInterop
  // cjsInterop: true,
  // splitting: true,
})
