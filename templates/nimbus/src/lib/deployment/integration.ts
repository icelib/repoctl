import type { AstroIntegration } from 'astro'
import type { DocsContext } from 'repoctl/docs-context'
import { readFile, writeFile } from 'node:fs/promises'
import { mergeDocsHeaders } from 'repoctl/docs-context'

/** Run after Nimbus so its discovery headers remain present in either channel. */
export function docsChannel(context: DocsContext): AstroIntegration {
  return {
    name: 'repoctl-docs-channel',
    hooks: {
      'astro:config:done': ({ config }) => {
        if (!config.site || new URL(config.site).origin !== context.origin) {
          throw new Error('Resolved Nimbus site differs from the documentation channel origin')
        }
      },
      'astro:build:done': async ({ dir }) => {
        const filename = new URL('_headers', dir)
        const existing = await readFile(filename, 'utf8').catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') {
            throw error
          }
          return ''
        })
        await writeFile(filename, mergeDocsHeaders(existing, context))
      },
    },
  }
}
