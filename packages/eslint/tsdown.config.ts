import { defineConfig } from 'tsdown'
import { antfuDeclarationHooks } from './declarations/antfu.ts'

export default defineConfig({
  checks: {
    pluginTimings: false,
  },
  entry: {
    index: 'src/index.ts',
    stylelint: 'src/stylelint.ts',
  },
  format: ['esm', 'cjs'],
  dts: {
    resolver: 'tsc',
  },
  clean: true,
  fixedExtension: false,
  hooks: antfuDeclarationHooks(),
  deps: {
    dts: {
      neverBundle: true,
      alwaysBundle: ['@antfu/eslint-config'],
    },
    neverBundle: ['eslint-plugin-mdx'],
    onlyBundle: false,
  },
})
