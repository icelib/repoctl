import { defineWranglerConfig } from 'wrangler/experimental-config'

// cf delegates Worker development and bundling to this implementation.
export default defineWranglerConfig({
  dev: { port: 8787, types: { generate: false } },
})
