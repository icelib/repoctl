import type { TemplateSnapshotFile } from '@icebreakers/monorepo-templates'
import type { TemplateDriftFile, TemplateDriftOwner } from './types'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import process from 'node:process'
import { safeInstancePath } from '@icebreakers/monorepo-templates'

export const contentHash = (content: Buffer) => createHash('sha256').update(content).digest('hex')
export const errorDetail = (error: unknown) => error instanceof Error ? error.message : String(error)
export const isMissing = (error: unknown) => ['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')

/** Open only retained managed paths and hash in bounded chunks, without serializing business contents. */
export async function compareManagedFile(workspaceDir: string, filename: string, baselineHash: string, executable?: boolean): Promise<TemplateDriftFile> {
  try {
    const file = await safeInstancePath(workspaceDir, filename)
    const expected = await lstat(file)
    if (!expected.isFile() || expected.isSymbolicLink() || expected.nlink !== 1) {
      throw new Error('The managed path is not a regular, singly linked file.')
    }
    const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    try {
      const before = await handle.stat()
      if (!before.isFile() || before.nlink !== 1 || before.ino !== expected.ino || before.dev !== expected.dev) {
        throw new Error('The managed path is not a regular, singly linked file.')
      }
      const hash = createHash('sha256')
      for await (const chunk of handle.createReadStream({ autoClose: false })) {
        hash.update(chunk)
      }
      const after = await handle.stat()
      const current = await lstat(await safeInstancePath(workspaceDir, filename))
      if (current.ino !== before.ino || current.dev !== before.dev || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
        throw new Error('The managed file changed while its digest was being read.')
      }
      const currentHash = hash.digest('hex')
      const modeChanged = executable !== undefined && process.platform !== 'win32' && ((after.mode & 0o111) !== 0) !== executable
      return { path: filename, baselineHash, currentHash, state: currentHash === baselineHash && !modeChanged ? 'unchanged' : 'modified', ...(modeChanged ? { detail: 'The executable flag differs from the retained baseline.' } : {}) }
    }
    finally {
      await handle.close()
    }
  }
  catch (error) {
    return { path: filename, baselineHash, state: isMissing(error) ? 'deleted' : 'unavailable', ...(isMissing(error) ? {} : { detail: errorDetail(error) }) }
  }
}

export function snapshotFileHash(file: TemplateSnapshotFile) {
  return contentHash(Buffer.from(file.content, 'base64'))
}

export function localDriftState(files: TemplateDriftFile[], baseline: TemplateDriftOwner['baseline']['status']): TemplateDriftOwner['local'] {
  if (baseline !== 'available' || files.some(file => file.state === 'unavailable')) {
    return 'unknown'
  }
  if (files.some(file => file.state === 'modified' || file.state === 'deleted')) {
    return 'drifted'
  }
  return files.length && files.every(file => file.state === 'excluded') ? 'excluded' : 'unchanged'
}
