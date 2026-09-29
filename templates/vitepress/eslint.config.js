import { defineEslintConfig } from 'repoctl/tooling'

export default await defineEslintConfig({
  options: { ignores: ['**/*.svg', '.cloudflare/**'] },
})
