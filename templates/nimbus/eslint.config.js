import astro from 'eslint-plugin-astro'
import * as mdx from 'eslint-plugin-mdx'
import { defineEslintConfig } from 'repoctl/tooling'

const shared = await defineEslintConfig({ options: { astro: false, formatters: false } })

// Markup has its own parser and formatter. Shared JS rules still check the
// virtual TypeScript files extracted from Astro script blocks.
const code = shared.map((config) => {
  if (Object.keys(config).every(key => key === 'name' || key === 'ignores')) {
    return config
  }
  return { ...config, ignores: [...(config.ignores ?? []), '**/*.astro', '**/*.mdx', '**/*.mdx/**'] }
})

export default [
  ...code,
  ...astro.configs['flat/recommended'],
  {
    ...mdx.flat,
    files: ['**/*.mdx'],
    languageOptions: { ...mdx.flat.languageOptions, globals: { Aside: 'readonly' } },
  },
  { ignores: ['.astro/**', '.nimbus/**', 'dist/**', '**/*.css'] },
]
