import process from 'node:process'
import { resolveDocsContext } from 'repoctl/docs-context'

// Configure distinct origins here; Astro's base option owns any path prefix.
export const deployment = resolveDocsContext({
  channel: process.env.REPO_DOCS_CHANNEL,
  url: process.env.REPO_DOCS_URL,
  previewOrigin: 'https://preview.docs.example.com',
  stableOrigin: 'https://docs.example.com',
})
