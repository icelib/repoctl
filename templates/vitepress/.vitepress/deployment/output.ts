import type { DocsDeployment } from './index'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { crawlerFiles } from './index'

export async function writeDeploymentFiles(outDir: string, deployment: DocsDeployment) {
  const { robots, headers } = crawlerFiles(deployment)
  await Promise.all([
    writeFile(path.join(outDir, 'robots.txt'), robots),
    writeFile(path.join(outDir, '_headers'), headers),
  ])
}
