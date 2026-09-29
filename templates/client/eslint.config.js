import { fileURLToPath } from 'node:url'
import { defineEslintConfig } from 'repoctl/tooling'

const tailwindEntryPoint = fileURLToPath(new URL('./src/style.css', import.meta.url))

export default await defineEslintConfig({
  options: {
    vue: true,
    typescript: true,
    tailwindcss: {
      entryPoint: tailwindEntryPoint,
    },
    ignores: ['**/fixtures/**', '**/*.svg', 'worker-configuration.d.ts', '.cloudflare/**'],
  },
})
