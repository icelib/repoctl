import type { KnipBaselineSaveResult, KnipCheckReport } from '../../../types/knip'
import { randomUUID } from 'node:crypto'
import { link, lstat, open, readFile, rename, unlink } from 'node:fs/promises'
import path from 'pathe'
import { assertSafePath, isWithin } from '../../clean/safety'
import { safeFile } from '../../deps/files'
import { validateKnipBaseline } from './baseline'
import { knipRoot } from './plan'

/** Only explicit writes can create/update a valid baseline; never overwrite arbitrary user files. */
export async function saveKnipBaseline(cwd: string, report: KnipCheckReport, file: string): Promise<KnipBaselineSaveResult> {
  const root = await knipRoot(cwd)
  if (report.schemaVersion !== 1 || report.kind !== 'knip-report' || report.status !== 'completed'
    || report.workspaceDir !== root || !report.scope || !file.trim()) {
    throw new Error('Only a complete successful Knip analysis can be saved as a baseline.')
  }
  const baseline = validateKnipBaseline({ schemaVersion: 1, kind: 'knip-baseline', scope: report.scope, findings: report.findings })
  const target = path.resolve(root, file)
  if (!isWithin(root, target)) {
    throw new Error('Knip baseline output must be inside the workspace.')
  }
  const parent = path.dirname(target)
  if (parent !== root) {
    await assertSafePath(root, parent, 'directory')
  }
  const original = await lstat(target).then(async () => {
    const content = await readFile(await safeFile(root, path.relative(root, target)), 'utf8')
    validateKnipBaseline(JSON.parse(content))
    return content
  }, (error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return null
    }
    throw error
  })
  const content = `${JSON.stringify(baseline, null, 2)}\n`
  if (original === content) {
    return { status: 'unchanged' as const, path: target, cleanupPending: [] as string[] }
  }
  const temporary = `${target}.repoctl-knip-${randomUUID()}.tmp`
  const handle = await open(temporary, 'wx', 0o600)
  let owned: { ino: bigint, dev: bigint } | undefined
  let wrote = false
  const cleanup = async () => {
    if (parent !== root) {
      await assertSafePath(root, parent, 'directory')
    }
    const metadata = await lstat(temporary, { bigint: true })
    if (!owned || !metadata.isFile() || metadata.ino !== owned.ino || metadata.dev !== owned.dev
      || !wrote || await readFile(temporary, 'utf8') !== content) {
      throw new Error('The baseline temporary file changed; preserve it for review.')
    }
    await unlink(temporary)
  }
  try {
    owned = await handle.stat({ bigint: true })
    await handle.writeFile(content, 'utf8')
    await handle.close()
    wrote = true
    if (parent !== root) {
      await assertSafePath(root, parent, 'directory')
    }
    await safeFile(root, path.relative(root, temporary))
    const current = await lstat(target).then(async () => readFile(await safeFile(root, path.relative(root, target)), 'utf8'), (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return null
      }
      throw error
    })
    if (current !== original) {
      throw new Error('Knip baseline changed concurrently; generate a new explicit save.')
    }
    if (original === null) {
      // Exclusive creation prevents overwriting a file that appears after the check.
      await link(temporary, target)
      const cleanupPending = await cleanup().then(() => [] as string[], () => [temporary])
      return { status: 'created' as const, path: target, cleanupPending }
    }
    await rename(temporary, target)
    return { status: 'updated' as const, path: target, cleanupPending: [] as string[] }
  }
  catch (error) {
    await handle.close().catch(() => {})
    await cleanup().catch(() => {})
    if (await lstat(temporary).then(() => true, () => false)) {
      throw new AggregateError([error], `Knip baseline save failed; inspect retained temporary file: ${temporary}`)
    }
    throw error
  }
}
