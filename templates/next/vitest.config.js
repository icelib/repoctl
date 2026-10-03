import react from '@vitejs/plugin-react'
import { defineVitestProjectConfig } from 'repoctl/tooling'
import { mergeConfig } from 'vitest/config'

export default mergeConfig(await defineVitestProjectConfig({
  options: { environment: 'jsdom' },
}), {
  plugins: [react()],
})
