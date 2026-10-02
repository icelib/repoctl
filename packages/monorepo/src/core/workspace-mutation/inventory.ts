import type { WorkspaceRemovalEntry } from '../../types/removal'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, readdir, readlink } from 'node:fs/promises'
import path from 'pathe'
import { assertSafePath } from '../../commands/clean/safety'

/** Enumerate links themselves, never their destinations, including ignored files. */
export async function workspaceInventory(root: string, target: string) {
  await assertSafePath(root, target, 'directory')
  const entries: WorkspaceRemovalEntry[] = []
  const repositories: string[] = []
  async function visit(file: string) {
    if (entries.length >= 100_000) {
      throw new Error('Workspace preview exceeds 100,000 entries. Review and clean generated files before generating a new plan.')
    }
    const metadata = await lstat(file)
    const relative = path.relative(target, file) || '.'
    const common = { path: relative, mode: metadata.mode, mtimeMs: metadata.mtimeMs }
    if (path.basename(file) === '.git') {
      repositories.push(path.relative(root, file))
    }
    if (metadata.isSymbolicLink()) {
      entries.push({ ...common, kind: 'symlink', link: await readlink(file) })
    }
    else if (metadata.isDirectory()) {
      await assertSafePath(root, file, 'directory')
      entries.push({ ...common, kind: 'directory' })
      if (path.basename(file) !== '.git') {
        for (const name of (await readdir(file)).sort()) {
          await visit(path.join(file, name))
        }
      }
    }
    else if (metadata.isFile()) {
      const digest = createHash('sha256')
      const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
      try {
        const opened = await handle.stat()
        if (!opened.isFile() || opened.dev !== metadata.dev || opened.ino !== metadata.ino) {
          throw new Error(`Workspace entry changed while opening: ${relative}`)
        }
        for await (const chunk of handle.createReadStream({ autoClose: false })) {
          digest.update(chunk)
        }
        const current = await handle.stat()
        if (current.size !== metadata.size || current.mtimeMs !== metadata.mtimeMs || current.ctimeMs !== metadata.ctimeMs) {
          throw new Error(`Workspace entry changed while reading: ${relative}`)
        }
      }
      finally {
        await handle.close()
      }
      entries.push({ ...common, kind: 'file', size: metadata.size, hash: digest.digest('hex') })
    }
    else {
      throw new Error(`Unsupported entry in workspace target: ${path.relative(root, file)}`)
    }
  }
  await visit(target)
  return { entries, repositories }
}
