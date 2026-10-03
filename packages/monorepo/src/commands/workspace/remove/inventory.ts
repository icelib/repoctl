import type { WorkspaceRemovalEntry } from '../../../types/removal'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, readdir, readlink } from 'node:fs/promises'
import path from 'pathe'
import { assertSafePath } from '../../clean/safety'

/** Enumerate links themselves, never their destinations, including ignored files. */
export async function removalInventory(root: string, target: string) {
  await assertSafePath(root, target, 'directory')
  const entries: WorkspaceRemovalEntry[] = []
  const repositories: string[] = []
  async function visit(file: string) {
    if (entries.length >= 100_000) {
      throw new Error('Removal preview exceeds 100,000 entries. Review and clean generated files before generating a new plan.')
    }
    const metadata = await lstat(file, { bigint: true })
    const relative = path.relative(target, file) || '.'
    // Keep the report JSON-compatible while identity and freshness checks retain full precision.
    const common = { path: relative, mode: Number(metadata.mode), mtimeMs: Number(metadata.mtimeNs) / 1_000_000 }
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
        const opened = await handle.stat({ bigint: true })
        if (!opened.isFile() || opened.dev !== metadata.dev || opened.ino !== metadata.ino) {
          throw new Error(`Removal entry changed while opening: ${relative}`)
        }
        for await (const chunk of handle.createReadStream({ autoClose: false })) {
          digest.update(chunk)
        }
        const current = await handle.stat({ bigint: true })
        if (current.size !== metadata.size || current.mtimeNs !== metadata.mtimeNs || current.ctimeNs !== metadata.ctimeNs) {
          throw new Error(`Removal entry changed while reading: ${relative}`)
        }
      }
      finally {
        await handle.close()
      }
      entries.push({ ...common, kind: 'file', size: Number(metadata.size), hash: digest.digest('hex') })
    }
    else {
      throw new Error(`Unsupported entry in removal target: ${path.relative(root, file)}`)
    }
  }
  await visit(target)
  return { entries, repositories }
}
