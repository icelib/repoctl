import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts', 'src/tooling-entry.ts', 'src/docs-context-entry.ts'],
  shims: true,
  format: ['esm'],
  clean: true,
  dts: true,
  target: 'node20',
})
