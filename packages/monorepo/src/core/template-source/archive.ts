import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { t, x } from 'tar'

export function digestBytes(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex')
}

export function verifyArchiveIntegrity(bytes: Uint8Array, integrity: string) {
  const candidates = integrity.split(/\s+/u).map(value => /^(sha512|sha384|sha256|sha1)-([A-Za-z0-9+/]+={0,2})$/u.exec(value)).filter(value => value !== null)
  const strongest = ['sha512', 'sha384', 'sha256', 'sha1'].find(algorithm => candidates.some(item => item[1] === algorithm))
  if (!strongest || !candidates.some(item => item[1] === strongest && createHash(strongest).update(bytes).digest('base64') === item[2])) {
    throw new Error('Template archive integrity verification failed; no target files were created.')
  }
}

interface AssetEntry {
  kind: 'file' | 'directory'
  size: number
  executable: number
  content?: string
}

function directoryEntry(): AssetEntry {
  return { kind: 'directory', size: 0, executable: 0 }
}

function treeDigest(entries: Map<string, AssetEntry>) {
  return digestBytes(Buffer.from(JSON.stringify([...entries].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))))
}

function portableAssetPath(name: string) {
  if (name.split('/').some(part => !part || part === '.' || part === '..' || /[\\:*?"<>|\p{Cc}]/u.test(part) || /[ .]$/u.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part))) {
    throw new Error('Unsafe portable archive path.')
  }
}

export async function hashAssetDirectory(directory: string) {
  const entries = new Map<string, AssetEntry>()
  let size = 0
  async function walk(current: string, relative: string) {
    const stat = await lstat(current)
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()) || (stat.isFile() && stat.nlink > 1)) {
      throw new Error('Template assets and cache entries cannot contain links or special files.')
    }
    if (relative) {
      portableAssetPath(relative)
    }
    size += stat.isFile() ? stat.size : 0
    if (entries.size >= 20_000 || size > 256 * 1024 * 1024) {
      throw new Error('Template assets exceed 20,000 entries or 256 MiB.')
    }
    if (stat.isDirectory()) {
      entries.set(relative, directoryEntry())
      for (const name of (await readdir(current)).sort()) {
        await walk(path.join(current, name), relative ? `${relative}/${name}` : name)
      }
    }
    else {
      entries.set(relative, { kind: 'file', size: stat.size, executable: process.platform === 'win32' ? 0 : stat.mode & 0o111, content: digestBytes(await readFile(current)) })
    }
  }
  await walk(directory, '')
  return treeDigest(entries)
}

/** Fingerprint the archive's logical extracted tree without writing any files. */
export async function hashTemplateArchive(archive: string, prefix: string) {
  if ((await lstat(archive)).size > 64 * 1024 * 1024) {
    throw new Error('Template archive exceeds 64 MiB.')
  }
  const entries = new Map<string, AssetEntry>([['', directoryEntry()]])
  const explicit = new Set<string>()
  const portableNames = new Map<string, string>()
  let size = 0
  let invalid = false
  function addPath(name: string, kind: AssetEntry['kind']) {
    const key = name.normalize('NFC').toLowerCase()
    if ((portableNames.has(key) && portableNames.get(key) !== name) || (entries.has(name) && entries.get(name)!.kind !== kind)) {
      throw new Error('Colliding archive paths.')
    }
    portableNames.set(key, name)
  }
  await t({
    file: archive,
    strict: true,
    onReadEntry(entry) {
      try {
        const name = entry.path.replace(/\/$/u, '')
        portableAssetPath(name)
        const [root, ...parts] = name.split('/')
        const relative = parts.join('/')
        size += entry.size
        if (!['File', 'OldFile', 'Directory'].includes(entry.type) || root !== prefix || explicit.has(name) || explicit.size >= 20_000 || size > 256 * 1024 * 1024 || (!relative && entry.type !== 'Directory')) {
          throw new Error('Invalid archive entry.')
        }
        explicit.add(name)
        for (let count = 1; count < parts.length; count++) {
          const parent = parts.slice(0, count).join('/')
          addPath(parent, 'directory')
          entries.set(parent, directoryEntry())
        }
        addPath(relative, entry.type === 'Directory' ? 'directory' : 'file')
        if (entry.type === 'Directory') {
          entries.set(relative, directoryEntry())
        }
        else {
          const content = createHash('sha256')
          entry.on('data', chunk => content.update(chunk))
          entry.on('end', () => entries.set(relative, { kind: 'file', size: entry.size, executable: process.platform === 'win32' ? 0 : (entry.mode ?? 0) & 0o111, content: content.digest('hex') }))
        }
      }
      catch {
        invalid = true
      }
    },
  })
  if (invalid || !explicit.size || entries.size > 20_000) {
    throw new Error('Template archive contains unsafe paths, links, colliding entries or exceeds asset limits.')
  }
  return treeDigest(entries)
}

export async function extractTemplateArchive(archive: string, destination: string, prefix: string) {
  const expected = await hashTemplateArchive(archive, prefix)
  await mkdir(destination, { recursive: true })
  await x({ file: archive, cwd: destination, strip: 1, strict: true, preserveOwner: false, noMtime: true })
  if (await hashAssetDirectory(destination) !== expected) {
    throw new Error('Extracted template assets do not match the verified archive.')
  }
  return expected
}
