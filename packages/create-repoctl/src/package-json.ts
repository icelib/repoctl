import fs from 'node:fs/promises'
import path from 'node:path'
import { createWorkspaceManifest, getWorkspacePackageManager } from '@icebreakers/monorepo-templates'

export async function updateRootPackageJson(targetDir: string, projectName: string) {
  const pkgPath = path.join(targetDir, 'package.json')
  const raw = await fs.readFile(pkgPath, 'utf8')
  const manifest = createWorkspaceManifest(JSON.parse(raw), {
    name: projectName,
    packageManager: await getWorkspacePackageManager(),
  })
  await fs.writeFile(pkgPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}
