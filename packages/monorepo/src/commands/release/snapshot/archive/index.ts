import type { ReadEntry } from 'tar'
import { Buffer } from 'node:buffer'
import { gzipSync } from 'node:zlib'
import { Header, Parser, Pax } from 'tar'

export interface SnapshotArchiveEntry {
  path: string
  mode: number
  type: 'File' | 'Directory'
  data: Buffer
}

/** Read without extracting archive paths or following links on the filesystem. */
export async function readSnapshotArchive(bytes: Uint8Array): Promise<SnapshotArchiveEntry[]> {
  return new Promise((resolve, reject) => {
    const entries: SnapshotArchiveEntry[] = []
    const paths = new Set<string>()
    const parser = new Parser({ strict: true })
    parser.on('error', reject)
    parser.on('entry', (entry: ReadEntry) => {
      const name = entry.path
      const parts = (entry.type === 'Directory' ? name.replace(/\/$/, '') : name).split('/')
      if (!name.startsWith('package/') || name.includes('\\') || parts.some(part => !part || part === '..' || part === '.')
        || paths.has(name) || !['File', 'Directory'].includes(entry.type)) {
        parser.abort(new Error(`Snapshot tarball contains an unsupported or duplicate entry: ${name}.`))
        entry.resume()
        return
      }
      paths.add(name)
      const chunks: Buffer[] = []
      entry.on('data', (chunk: Buffer) => chunks.push(chunk))
      entry.on('end', () => entries.push({ path: name, mode: entry.mode ?? 0o644, type: entry.type as SnapshotArchiveEntry['type'], data: Buffer.concat(chunks) }))
    })
    parser.on('end', () => resolve(entries))
    parser.end(Buffer.from(bytes))
  })
}

/** Canonical headers preserve permissions and file bytes while removing host/time variance. */
export function writeSnapshotArchive(entries: SnapshotArchiveEntry[]): Uint8Array<ArrayBuffer> {
  const blocks: Buffer[] = []
  for (const entry of [...entries].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) {
    const header = new Header({ path: entry.path, mode: entry.mode, type: entry.type, size: entry.data.length, uid: 0, gid: 0, mtime: new Date('1985-10-26T08:15:00.000Z') })
    if (header.encode()) {
      blocks.push(new Pax({ path: entry.path, size: entry.data.length }).encode())
    }
    blocks.push(header.block!, entry.data)
    if (entry.data.length % 512) {
      blocks.push(Buffer.alloc(512 - entry.data.length % 512))
    }
  }
  blocks.push(Buffer.alloc(1024))
  const compressed = Uint8Array.from(gzipSync(Buffer.concat(blocks), { level: 9 }))
  // Gzip's platform byte otherwise varies between Unix and Windows zlib builds.
  compressed[9] = 255
  return compressed
}
