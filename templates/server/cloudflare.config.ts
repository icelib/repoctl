import { defineConfig } from 'cf/config'

export default defineConfig({
  worker: {
    name: 'monorepo-service',
    compatibilityDate: '2025-10-16',
    compatibilityFlags: ['nodejs_compat'],
    entrypoint: './src/fetch-entry.ts',
    // Add fetch triggers here when you bind a real custom domain.
    observability: { enabled: true },
  },
})
