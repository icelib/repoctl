import { defineConfig } from 'cf/config'

export default defineConfig({
  worker: {
    name: 'monorepo-client',
    compatibilityDate: '2025-10-16',
    compatibilityFlags: [
      'nodejs_compat',
    ],
    entrypoint: './worker/fetch-entry.ts',
    observability: {
      enabled: true,
    },
    assets: {
      notFoundHandling: 'single-page-application',
      runWorkerFirst: [
        '/api',
        '/api/*',
      ],
    },
  },
})
