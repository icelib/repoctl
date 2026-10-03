import type { Stats } from 'node:fs'
import type { ArtifactFile } from '../../../../types/artifact'
import { lstat, readlink, realpath, rmdir, unlink } from 'node:fs/promises'
import path from 'pathe'
import { fileHash } from '../tree'

export interface OwnedOutput {
  filename: string
  identity: Stats
  file: ArtifactFile
}

export function sameIdentity(left: Stats, right: Stats) {
  return left.ino === right.ino && left.dev === right.dev
}

export async function checkParents(root: string, filename: string, directories: Map<string, Stats>) {
  let current = path.dirname(filename)
  while (true) {
    const expected = directories.get(current)
    const actual = await lstat(current)
    if (!expected || actual.isSymbolicLink() || !actual.isDirectory() || !sameIdentity(actual, expected) || path.normalize(await realpath(current)) !== current) {
      throw new Error(`Artifact output directory changed: ${current}`)
    }
    if (current === root) {
      return
    }
    current = path.dirname(current)
  }
}

async function unchanged(item: OwnedOutput) {
  const current = await lstat(item.filename)
  if (!sameIdentity(current, item.identity) || current.mode !== item.identity.mode) {
    return false
  }
  if (item.file.kind === 'directory') {
    return current.isDirectory() && !current.isSymbolicLink()
  }
  if (item.file.kind === 'link') {
    return current.isSymbolicLink() && path.resolve(path.dirname(item.filename), await readlink(item.filename)) === path.resolve(path.dirname(item.filename), item.file.link!)
  }
  return current.isFile() && !current.isSymbolicLink() && await fileHash(item.filename) === item.file.hash
}

export async function rollbackOutput(root: string, entries: OwnedOutput[], directories: Map<string, Stats>, createdRoot: boolean) {
  const retained: string[] = []
  for (const item of [...entries].reverse()) {
    try {
      await checkParents(root, item.filename, directories)
      if (!await unchanged(item)) {
        throw new Error('Concurrent output edit must be retained')
      }
      if (item.file.kind === 'directory') {
        await rmdir(item.filename)
      }
      else {
        await unlink(item.filename)
      }
    }
    catch {
      retained.push(item.filename)
    }
  }
  if (createdRoot) {
    try {
      const current = await lstat(root)
      if (!current.isSymbolicLink() && sameIdentity(current, directories.get(root)!)) {
        await rmdir(root)
      }
    }
    catch { retained.push(root) }
  }
  return retained
}
