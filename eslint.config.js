import { loadMonorepoToolingModule } from './tooling/load-tooling-module.mjs'

const { defineEslintConfig } = await loadMonorepoToolingModule()

const config = await defineEslintConfig()

export default [
  ...config,
  {
    ignores: [
      '**/*.svg',
      '**/.cloudflare/**',
      'packages/monorepo/test/fixtures/demo/**',
      'templates/vitepress/.vitepress/config.ts.timestamp-*.mjs',
    ],
  },
]
