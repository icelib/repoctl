import { readFile } from 'node:fs/promises'
import { TextDecoder } from 'node:util'
import { safeFile } from '../../deps/files'

export async function readDoctorManifest(workspaceDir: string) {
  const bytes = await readFile(await safeFile(workspaceDir, 'package.json'))
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  }
  catch {
    throw new Error('Doctor cannot safely fix a package.json that is not valid UTF-8.')
  }
}
