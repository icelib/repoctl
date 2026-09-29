import { defineWranglerConfig } from 'wrangler/experimental-config'

// Rendering runs in package scripts before cf assembles deployment output.
export default defineWranglerConfig({
  assetsDirectory: '.vitepress/dist',
  dev: { types: { generate: false } },
})
