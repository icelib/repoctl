import { defineConfig } from 'tsdown'

export default defineConfig({
  checks: {
    pluginTimings: false,
  },
  entry: {
    'index': 'src/index.ts',
    'cli': 'src/cli.ts',
    'presets/scss': 'src/presets/scss.ts',
    'presets/vue': 'src/presets/vue.ts',
    'presets/order': 'src/presets/order.ts',
  },
  format: ['esm'],
  dts: {
    resolver: 'oxc',
  },
  clean: true,
  fixedExtension: false,
  deps: {
    alwaysBundle: ['stylelint-scss', 'stylelint-config-recommended-scss', 'stylelint-config-recommended-vue', 'stylelint-config-recess-order'],
    neverBundle: ['stylelint', 'postcss-scss', 'stylelint-order'],
    onlyBundle: false,
  },
})
