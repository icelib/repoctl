import type { ArtifactFile } from '../../../types/artifact'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, lstat, mkdir, readdir, readlink } from 'node:fs/promises'
import path from 'pathe'
import { relativeArtifactPath } from './paths'

const ignored = new Set(['node_modules', '.git', '.turbo', '.repoctl'])
const examples = new Set(['.env.example', '.env.sample'])

export function privateFile(name: string) {
  const normalized = name.toLowerCase()
  return !examples.has(normalized) && (normalized === '.env' || normalized.startsWith('.env.')
    || ['.npmrc', '.netrc', '_netrc', '.yarnrc', '.yarnrc.yml', '.aws', '.ssh', '.gnupg'].includes(normalized))
}

export async function fileHash(filename: string) {
  const hash = createHash('sha256')
  for await (const data of createReadStream(filename)) {
    hash.update(data)
  }
  return hash.digest('hex')
}

export function fingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export async function inventory(root: string, source = false) {
  const files: ArtifactFile[] = []
  const excluded: string[] = []
  let size = 0
  async function visit(relative: string) {
    for (const name of (await readdir(path.join(root, relative))).sort()) {
      const file = relativeArtifactPath(relative ? `${relative}/${name}` : name)
      if (source && ignored.has(name)) {
        continue
      }
      if (source && privateFile(name)) {
        excluded.push(file)
        continue
      }
      const filename = path.join(root, file)
      const stat = await lstat(filename)
      size += stat.isFile() ? stat.size : 0
      if (files.length >= 100000 || size > 1024 * 1024 * 1024) {
        throw new Error('Artifact inputs exceed 100,000 entries or 1 GiB; narrow the source workspace before preparing an artifact.')
      }
      if (stat.isSymbolicLink()) {
        if (source) {
          throw new Error(`Linked source input is unsupported: ${file}. Materialize it inside the workspace first.`)
        }
        const link = await readlink(filename)
        const target = path.resolve(path.dirname(filename), link)
        const inside = path.relative(root, target)
        if (!inside || inside === '..' || inside.startsWith('../') || path.isAbsolute(inside)) {
          throw new Error(`Native artifact contains an external link: ${file}`)
        }
        files.push({ path: file, kind: 'link', mode: stat.mode & 0o777, size: 0, hash: null, link: path.relative(path.dirname(filename), target) })
      }
      else if (stat.isDirectory()) {
        files.push({ path: file, kind: 'directory', mode: stat.mode & 0o777, size: 0, hash: null, link: null })
        await visit(file)
      }
      else if (stat.isFile()) {
        files.push({ path: file, kind: 'file', mode: stat.mode & 0o777, size: stat.size, hash: await fileHash(filename), link: null })
      }
      else {
        throw new Error(`Unsupported artifact input: ${file}`)
      }
    }
  }
  await visit('')
  return { files, excluded }
}

export async function copySource(root: string, destination: string, files: ArtifactFile[]) {
  await mkdir(destination)
  for (const file of files) {
    const output = path.join(destination, file.path)
    if (file.kind === 'directory') {
      await mkdir(output, { mode: file.mode })
    }
    else {
      await copyFile(path.join(root, file.path), output)
    }
  }
}
