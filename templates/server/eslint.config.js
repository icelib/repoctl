import { defineEslintConfig } from 'repoctl/tooling'

export default await defineEslintConfig({
  options: {
    typescript: true,
    ignores: ['worker-configuration.d.ts', '.cloudflare/**'],
  },
})
