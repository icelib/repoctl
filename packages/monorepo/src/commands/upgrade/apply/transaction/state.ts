import { lstat, mkdir, open, readFile, realpath, rm, rmdir } from 'node:fs/promises'
import path from 'pathe'
import { checkedFile, hash } from '../../plan/files'

export interface Identity {
  ino: number
  dev: number
}

export interface OwnedFile {
  path: string
  hash: string
  identity?: Identity
  owned: boolean
}

export interface OwnedDirectory {
  path: string
  identity: Identity
}

export async function ensureParent(directory: string, created: OwnedDirectory[]): Promise<void> {
  try {
    const info = await lstat(directory)
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error(`Unsafe parent directory: ${directory}`)
    }
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
    await ensureParent(path.dirname(directory), created)
    try {
      await mkdir(directory)
      const info = await lstat(directory)
      created.push({ path: directory, identity: { ino: info.ino, dev: info.dev } })
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error
      }
      const info = await lstat(directory)
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw error
      }
    }
  }
}

/** Only empty directories with the same identity are ours to remove. */
export async function cleanDirectories(created: OwnedDirectory[]) {
  for (const directory of [...created].reverse()) {
    try {
      const info = await lstat(directory.path)
      if (info.isDirectory() && !info.isSymbolicLink() && info.ino === directory.identity.ino && info.dev === directory.identity.dev && path.normalize(await realpath(directory.path)) === directory.path) {
        await rmdir(directory.path)
      }
    }
    catch {}
  }
}

export async function stageOwnedFile(root: string, file: OwnedFile, content: Uint8Array, mode?: number) {
  await checkedFile(root, path.relative(root, file.path))
  const handle = await open(file.path, 'wx', mode ?? 0o666)
  file.owned = true
  try {
    const info = await handle.stat()
    file.identity = { ino: info.ino, dev: info.dev }
    if (mode !== undefined) {
      await handle.chmod(mode)
    }
    await handle.writeFile(content)
  }
  finally {
    await handle.close()
  }
}

export async function verifyOwnedFile(root: string, file: OwnedFile) {
  if (!file.owned || !file.identity) {
    throw new Error(`Unowned upgrade recovery file: ${file.path}`)
  }
  const target = await checkedFile(root, path.relative(root, file.path), file.identity)
  const info = await lstat(target)
  if (info.ino !== file.identity.ino || info.dev !== file.identity.dev || hash(await readFile(target)) !== file.hash) {
    throw new Error(`Upgrade recovery file changed: ${file.path}`)
  }
}

export async function removeOwnedFile(root: string, file: OwnedFile) {
  if (file.owned) {
    await verifyOwnedFile(root, file)
    await rm(file.path)
    file.owned = false
  }
}
