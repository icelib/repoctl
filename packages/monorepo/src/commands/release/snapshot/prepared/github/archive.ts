import type { SnapshotGitHub } from './client'
import type { SnapshotArtifactEvidence } from './types'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import * as yauzl from 'yauzl'
import { digest, positive, record } from './client'

const archiveLimit = 256 * 1024 * 1024
const expandedLimit = 512 * 1024 * 1024
const entryLimit = 128 * 1024 * 1024

/** Read data into memory only; never extract candidate paths onto the publisher filesystem. */
export function readSnapshotZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  if (bytes.byteLength > archiveLimit) {
    throw new Error('Snapshot ZIP exceeds the archive size limit.')
  }
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(Buffer.from(bytes), { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error || !zip) {
        reject(new Error('Snapshot artifact is not a valid ZIP archive.'))
        return
      }
      const files = new Map<string, Uint8Array>()
      const names = new Set<string>()
      const directories = new Set<string>()
      let expanded = 0
      let failed = false
      const fail = (reason: unknown) => {
        if (!failed) {
          failed = true
          zip.close()
          reject(reason instanceof Error ? reason : new Error('Snapshot ZIP validation failed.'))
        }
      }
      zip.on('error', fail)
      zip.on('entry', (entry: yauzl.Entry) => {
        const directory = entry.fileName.endsWith('/')
        const name = directory ? entry.fileName.slice(0, -1) : entry.fileName
        const mode = (entry.externalFileAttributes >>> 16) & 0xF000
        if (!name || /[\\:\p{Cc}]/u.test(name) || name.split('/').some(part => !part || part === '.' || part === '..')
          || names.has(name) || names.size >= 2048 || (entry.generalPurposeBitFlag & 0x41) !== 0
          || ![0, 8].includes(entry.compressionMethod) || ![0, directory ? 0x4000 : 0x8000].includes(mode)
          || entry.uncompressedSize > entryLimit || (directory && entry.uncompressedSize !== 0)) {
          fail(new Error('Snapshot ZIP contains duplicate, unsafe, linked or oversized entries.'))
          return
        }
        names.add(name)
        expanded += entry.uncompressedSize
        if (expanded > expandedLimit) {
          fail(new Error('Snapshot ZIP exceeds the expanded size limit.'))
          return
        }
        if (directory) {
          directories.add(name)
          zip.readEntry()
          return
        }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            fail(new Error('Snapshot ZIP entry could not be opened.'))
            return
          }
          const chunks: Uint8Array[] = []
          let length = 0
          stream.on('error', fail)
          stream.on('data', (chunk: Buffer) => {
            length += chunk.length
            if (length > entry.uncompressedSize || length > entryLimit) {
              stream.destroy(new Error('Snapshot ZIP entry exceeds its declared size.'))
              return
            }
            chunks.push(chunk)
          })
          stream.on('end', () => {
            if (failed) {
              return
            }
            if (length !== entry.uncompressedSize) {
              fail(new Error('Snapshot ZIP entry size does not match its declaration.'))
              return
            }
            files.set(name, Buffer.concat(chunks, length))
            zip.readEntry()
          })
        })
      })
      zip.on('end', () => {
        if (failed) {
          return
        }
        if (!files.size || [...directories].some(directory => ![...files.keys()].some(name => name.startsWith(`${directory}/`)))
          || [...files.keys()].some(name => name.split('/').slice(0, -1).some((_, index, parts) => files.has(parts.slice(0, index + 1).join('/'))))) {
          fail(new Error('Snapshot ZIP contains empty or conflicting paths.'))
          return
        }
        resolve(files)
      })
      zip.readEntry()
    })
  })
}

export async function downloadSnapshotArtifact(client: SnapshotGitHub, options: {
  artifact: SnapshotArtifactEvidence
  name: string
  runId: number
  repositoryId: number
  workflowSha: string
}) {
  const id = positive(options.artifact.id, 'artifact ID')
  const metadata = record(await client.json(`/actions/artifacts/${id}`))
  const run = record(metadata['workflow_run'])
  const expectedDigest = digest(options.artifact.digest)
  if (metadata['id'] !== id || metadata['name'] !== options.name || metadata['expired'] !== false
    || run['id'] !== options.runId || run['repository_id'] !== options.repositoryId || run['head_repository_id'] !== options.repositoryId
    || run['head_sha'] !== options.workflowSha || digest(metadata['digest']) !== expectedDigest
    || typeof metadata['size_in_bytes'] !== 'number' || metadata['size_in_bytes'] > archiveLimit || metadata['size_in_bytes'] <= 0) {
    throw new Error('Snapshot artifact identity, digest or originating workflow does not match.')
  }
  const bytes = await client.binary(`/actions/artifacts/${id}/zip`, archiveLimit)
  if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== expectedDigest) {
    throw new Error('Snapshot artifact ZIP digest does not match the immutable GitHub artifact.')
  }
  return readSnapshotZip(bytes)
}
