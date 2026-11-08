import { defineConfig } from 'tsdown'

export default defineConfig({
  checks: {
    pluginTimings: false,
  },
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm'],
  dts: {
    resolver: 'oxc',
  },
  clean: true,
  fixedExtension: false,
  deps: {
    onlyBundle: false,
  },
})
