import type { ArtifactFile } from '../../../../types/artifact'
import type { OwnedOutput } from './state'
import { createHash } from 'node:crypto'
import { open } from 'node:fs/promises'

/** Own the exclusive file descriptor before writing; retain proof of each written prefix for recovery. */
export async function writeOwnedFile(filename: string, chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>, expected: ArtifactFile, owned: OwnedOutput[]) {
  const handle = await open(filename, 'wx', expected.mode)
  const content = createHash('sha256')
  try {
    const item: OwnedOutput = { filename, identity: await handle.stat(), file: { ...expected, size: 0, hash: content.copy().digest('hex') } }
    owned.push(item)
    await handle.chmod(expected.mode)
    item.identity = await handle.stat()
    for await (const chunk of chunks) {
      let offset = 0
      while (offset < chunk.byteLength) {
        const { bytesWritten } = await handle.write(chunk, offset, chunk.byteLength - offset)
        if (bytesWritten === 0) {
          throw new Error('Artifact write made no progress')
        }
        content.update(chunk.subarray(offset, offset + bytesWritten))
        offset += bytesWritten
        item.file.size += bytesWritten
        item.file.hash = content.copy().digest('hex')
      }
    }
    if (item.file.hash !== expected.hash || item.file.size !== expected.size) {
      throw new Error(`Staged artifact changed during publication: ${expected.path}`)
    }
  }
  finally {
    await handle.close()
  }
}
