import type { GeneratePlan, GenerateResult } from './types'
import { randomUUID } from 'node:crypto'
import { lstat, mkdir, open, readFile, realpath, rmdir, unlink } from 'node:fs/promises'
import path from 'pathe'
import { stageFileTransaction } from '../../core/file-transaction'
import { withOperationLock } from '../../core/operation-lock'
import { safeFile } from '../deps/files'
import { generatorFile } from './files'
import { planGenerate } from './plan'

async function applyLocked(plan: GeneratePlan): Promise<GenerateResult> {
  const fresh = await planGenerate(plan.options)
  if (JSON.stringify(fresh) !== JSON.stringify(plan)) {
    throw new Error('Generator plan is stale or modified; create and review a fresh plan.')
  }
  const changes = fresh.files.filter(file => file.action !== 'unchanged')
  const result: GenerateResult = { schemaVersion: 1, changed: [], recoveryFiles: [], nextSteps: fresh.nextSteps }
  if (!changes.length) {
    return result
  }
  const placeholder = `repoctl-generator-${randomUUID()}\n`
  const createdFiles: Array<{ path: string, identity: Awaited<ReturnType<typeof lstat>>, written: boolean }> = []
  const createdDirectories: Array<{ path: string, identity: Awaited<ReturnType<typeof lstat>> }> = []
  let transaction: Awaited<ReturnType<typeof stageFileTransaction>> | undefined
  const cleanupDirectories = async () => {
    for (const item of [...createdDirectories].reverse()) {
      try {
        const stat = await lstat(item.path)
        if (stat.ino === item.identity.ino && stat.dev === item.identity.dev && !stat.isSymbolicLink()) {
          await rmdir(item.path)
        }
      }
      catch {}
    }
  }
  try {
    for (const file of changes.filter(item => item.before === null)) {
      let cursor = plan.packageDir
      for (const part of path.dirname(file.path).split('/').filter(part => part !== '.')) {
        cursor = path.join(cursor, part)
        try {
          await mkdir(cursor)
          createdDirectories.push({ path: cursor, identity: await lstat(cursor) })
        }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
            throw error
          }
        }
        const metadata = await lstat(cursor)
        if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
          throw new Error(`Generator directory changed: ${cursor}`)
        }
      }
      if (await generatorFile(plan.packageDir, file.path) !== null) {
        throw new Error(`Generator output appeared after planning: ${file.path}`)
      }
      const handle = await open(path.join(plan.packageDir, file.path), 'wx')
      const item = { path: file.path, identity: await handle.stat(), written: false }
      createdFiles.push(item)
      try {
        await handle.writeFile(placeholder)
        item.written = true
      }
      finally {
        await handle.close()
      }
    }
    transaction = await stageFileTransaction(changes.map(file => ({ path: file.path, original: file.before ?? placeholder, content: file.after })), file => safeFile(plan.packageDir, file), 'generate')
    await transaction.apply()
    const verification = await planGenerate(plan.options)
    if (verification.files.some(file => file.action !== 'unchanged')) {
      throw new Error('Generator outputs changed during verification.')
    }
    result.changed = changes.map(file => file.path)
  }
  catch (error) {
    const recovery = await transaction?.rollback() ?? []
    for (const file of createdFiles) {
      try {
        const filename = await safeFile(plan.packageDir, file.path)
        const metadata = await lstat(filename)
        const owned = file.written ? await readFile(filename, 'utf8') === placeholder : metadata.ino === file.identity.ino && metadata.dev === file.identity.dev
        if (!owned) {
          throw new Error('Generator placeholder was modified')
        }
        await unlink(filename)
      }
      catch {
        recovery.push(path.join(plan.packageDir, file.path))
      }
    }
    await cleanupDirectories()
    if (recovery.length) {
      throw new AggregateError([error], `Generator rollback needs attention; preserve recovery files: ${recovery.join(', ')}`)
    }
    throw error
  }
  result.recoveryFiles = await transaction.cleanup()
  return result
}

export async function applyGeneratePlan(plan: GeneratePlan): Promise<GenerateResult> {
  if (plan?.schemaVersion !== 1 || typeof plan.packageDir !== 'string' || path.normalize(await realpath(plan.packageDir)) !== plan.packageDir) {
    throw new Error('Invalid generator plan or noncanonical package directory.')
  }
  const fresh = await planGenerate(plan.options)
  if (JSON.stringify(fresh) !== JSON.stringify(plan)) {
    throw new Error('Generator plan is stale or modified; create and review a fresh plan.')
  }
  return withOperationLock(plan.packageDir, 'generate', () => applyLocked(plan))
}
