import { defineEslintConfig } from 'repoctl/tooling'

export default await defineEslintConfig({
  options: { react: true, typescript: true },
})
