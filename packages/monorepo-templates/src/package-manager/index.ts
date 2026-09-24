import path from 'node:path'
import { assetsDir } from '../paths'
import { ensureTemplateAssetsPrepared } from '../runtime-assets'
import { readPackageManagerFromManifest } from './read'

export { readPackageManagerFromManifest, validateWorkspacePackageManager } from './read'

export async function getWorkspacePackageManager() {
  await ensureTemplateAssetsPrepared()
  return readPackageManagerFromManifest(path.join(assetsDir, 'package.json'))
}
