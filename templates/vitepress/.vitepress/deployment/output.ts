import type { DocsDeployment } from './index'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { mergeDocsHeaders } from 'repoctl/docs-context'
import { crawlerFiles } from './index'

export async function writeDeploymentFiles(outDir: string, deployment: DocsDeployment) {
  const { robots } = crawlerFiles(deployment)
  const filename = path.join(outDir, '_headers')
  const existing = await readFile(filename, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') {
      throw error
    }
    return ''
  })
  await Promise.all([
    writeFile(path.join(outDir, 'robots.txt'), robots),
    writeFile(filename, mergeDocsHeaders(existing, deployment)),
  ])
}
