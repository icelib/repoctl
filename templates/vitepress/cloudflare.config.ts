import { defineConfig } from 'cf/config'

export default defineConfig({
  worker: {
    name: 'repoctl-docs',
    compatibilityDate: '2026-08-16',
    compatibilityFlags: ['nodejs_compat'],
    workersDev: false,
    previewUrls: true,
    assets: {
      notFoundHandling: '404-page',
    },
    domains: ['repoctl.icebreaker.top'],
    observability: { enabled: true, headSamplingRate: 1 },
  },
})
