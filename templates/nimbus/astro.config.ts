import nimbus, { defineConfig as defineNimbusConfig } from '@cloudflare/nimbus-docs'
import { defineConfig } from 'astro/config'

export default defineConfig({
  output: 'static',
  // Keep the Pagefind loader external so Vite finalizes dynamic imports before Astro renders it.
  vite: { build: { assetsInlineLimit: 0 } },
  integrations: [nimbus(defineNimbusConfig({
    // Set your production origin before publishing.
    site: 'https://docs.example.com',
    title: 'Project docs',
    description: 'Guides and examples for your project.',
    locale: 'en',
    github: null,
  }), {
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
  })],
})
