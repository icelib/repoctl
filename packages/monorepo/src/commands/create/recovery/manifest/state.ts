import type { FileIdentity } from './record'
import { lstat, readFile } from 'node:fs/promises'
import { fileIdentity, sameFileIdentity } from './record'

export type ManifestSnapshot = { exists: false } | {
  exists: true
  text: string
  identity: FileIdentity
}

export async function readManifestSnapshot(manifestPath: string): Promise<ManifestSnapshot> {
  let before
  try {
    before = await lstat(manifestPath)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { exists: false }
    }
    throw error
  }
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new Error('The workspace manifest is not a regular file.')
  }
  const text = await readFile(manifestPath, 'utf8')
  const after = await lstat(manifestPath)
  if (!after.isFile() || after.isSymbolicLink() || !sameFileIdentity(fileIdentity(before), fileIdentity(after))) {
    throw new Error('The workspace manifest changed while being inspected.')
  }
  return { exists: true, text, identity: fileIdentity(after) }
}

export function sameManifestSnapshot(left: ManifestSnapshot, right: ManifestSnapshot) {
  return left.exists === false
    ? right.exists === false
    : right.exists && left.text === right.text && sameFileIdentity(left.identity, right.identity)
}
