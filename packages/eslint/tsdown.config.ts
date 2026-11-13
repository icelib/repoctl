import { defineConfig } from 'tsdown'
import { antfuDeclarationHooks, antfuLicenseCopy } from './declarations/antfu.ts'

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
    resolver: 'oxc',
  },
  clean: true,
  fixedExtension: false,
  copy: antfuLicenseCopy,
  hooks: antfuDeclarationHooks(),
  deps: {
    dts: {
      neverBundle: true,
      // Upstream parser types omit a TypeScript dependency in part of their closure.
      // Bundle that closure so its compiler API can use our explicit legacy package.
      alwaysBundle: ['@antfu/eslint-config', /^@typescript-eslint\//u],
    },
    neverBundle: ['eslint-plugin-mdx'],
    onlyBundle: false,
  },
})
