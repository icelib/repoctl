import nimbus, { defineConfig as defineNimbusConfig } from '@cloudflare/nimbus-docs'
import { defineConfig } from 'astro/config'
import { deployment } from './src/lib/deployment'
import { docsChannel } from './src/lib/deployment/integration'

export default defineConfig({
  output: 'static',
  // Keep the Pagefind loader external so Vite finalizes dynamic imports before Astro renders it.
  vite: { build: { assetsInlineLimit: 0 } },
  integrations: [nimbus(defineNimbusConfig({
    site: deployment.origin,
    title: 'Project docs',
    description: 'Guides and examples for your project.',
    locale: 'en',
    github: null,
  }), {
    sitemap: !deployment.preview,
    icons: false,
    rules: {
      'nimbus/frontmatter-shape': 'error',
      'nimbus/internal-link': 'error',
      'nimbus/single-h1': 'error',
    },
    markdown: {
      componentMap: {
        Aside: { revision: '1', render: ({ children }) => children },
      },
    },
  }), docsChannel(deployment)],
})
