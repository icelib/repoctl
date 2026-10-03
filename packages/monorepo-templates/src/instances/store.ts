import type { TemplateInstance, TemplateInstanceDraft, TemplateInstanceRegistrationOptions, TemplateInstanceRegistry, TemplateInstanceReplacementHooks, TemplateSnapshot } from './types'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { exists, instanceRelativePath, safeInstancePath, templateBaselineDirectory, templateRegistryPath } from './paths'
import { digestPattern, parseRegistry, validateInstance } from './schema'
import { snapshotDigest, validateSnapshot } from './snapshot'

export class TemplateRegistryCleanupError extends AggregateError {
  constructor(readonly paths: string[], errors: unknown[]) {
    super(errors, `Template registry cleanup failed; inspect retained metadata: ${paths.join(', ')}`)
  }
}

async function removeOwnedLock(lockPath: string, token: string) {
  try {
    const stat = await fs.lstat(lockPath)
    if (stat.isFile() && await fs.readFile(lockPath, 'utf8') === token) {
      await fs.rm(lockPath)
    }
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}

async function removeOwnedTemporary(filename: string, owner: { dev: bigint, ino: bigint } | undefined) {
  if (!owner) {
    return
  }
  try {
    const stat = await fs.lstat(filename, { bigint: true })
    if (stat.isFile() && stat.dev === owner.dev && stat.ino === owner.ino) {
      await fs.rm(filename)
    }
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}

export async function loadTemplateInstanceRegistry(workspaceDir: string): Promise<TemplateInstanceRegistry> {
  const file = await safeInstancePath(workspaceDir, templateRegistryPath)
  return await exists(file) ? parseRegistry(await fs.readFile(file, 'utf8')) : { schemaVersion: 1, instances: [] }
}

export async function loadTemplateBaseline(workspaceDir: string, digest: string): Promise<TemplateSnapshot> {
  if (!digestPattern.test(digest)) {
    throw new Error('Invalid template baseline digest.')
  }
  const file = await safeInstancePath(workspaceDir, `${templateBaselineDirectory}/${digest}.json`)
  const snapshot: unknown = JSON.parse(await fs.readFile(file, 'utf8'))
  validateSnapshot(snapshot)
  if (snapshotDigest(snapshot) !== digest) {
    throw new Error(`Template baseline integrity check failed: ${digest}`)
  }
  return snapshot
}

export async function mutateTemplateRegistry<T>(
  workspaceDir: string,
  mutate: (registry: TemplateInstanceRegistry) => Promise<{ result: T, snapshots?: Record<string, TemplateSnapshot> }>,
  hooks?: Pick<TemplateInstanceReplacementHooks, 'rollback' | 'committed'>,
): Promise<T> {
  const file = await safeInstancePath(workspaceDir, templateRegistryPath)
  const lockPath = await safeInstancePath(workspaceDir, '.repoctl/template-instances.lock')
  await fs.mkdir(path.dirname(file), { recursive: true })
  let lock
  try {
    lock = await fs.open(lockPath, 'wx')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`Template registry is locked: ${lockPath}. If its operation crashed, verify that no writer is active before removing this lock.`)
    }
    throw error
  }
  const written: string[] = []
  const temporary = `${file}.${randomUUID()}.tmp`
  let temporaryOwner: { dev: bigint, ino: bigint } | undefined
  const lockToken = `${process.pid}:${randomUUID()}\n`
  let committed = false
  let result!: T
  let failure: { error: unknown } | undefined
  try {
    await lock.writeFile(lockToken)
    const registry = await loadTemplateInstanceRegistry(workspaceDir)
    const previous = JSON.stringify(registry)
    const mutation = await mutate(registry)
    result = mutation.result
    const snapshots = mutation.snapshots ?? {}
    registry.instances.sort((a, b) => a.target < b.target ? -1 : a.target > b.target ? 1 : 0)
    parseRegistry(JSON.stringify(registry))
    if (JSON.stringify(registry) !== previous) {
      for (const [digest, snapshot] of Object.entries(snapshots)) {
        validateSnapshot(snapshot)
        if (!digestPattern.test(digest) || snapshotDigest(snapshot) !== digest) {
          throw new Error('Template snapshot digest does not match its content.')
        }
        const target = await safeInstancePath(workspaceDir, `${templateBaselineDirectory}/${digest}.json`)
        if (await exists(target)) {
          await loadTemplateBaseline(workspaceDir, digest)
          continue
        }
        await fs.mkdir(path.dirname(target), { recursive: true })
        const handle = await fs.open(target, 'wx')
        written.push(target)
        try {
          await handle.writeFile(`${JSON.stringify(snapshot)}\n`)
        }
        finally {
          await handle.close()
        }
      }
      const handle = await fs.open(temporary, 'wx')
      try {
        temporaryOwner = await handle.stat({ bigint: true })
        await handle.writeFile(`${JSON.stringify(registry, null, 2)}\n`)
      }
      finally {
        await handle.close()
      }
      await fs.rename(temporary, file)
    }
    committed = true
    await hooks?.committed()
  }
  catch (error) {
    failure = { error }
    if (!committed) {
      try {
        await hooks?.rollback()
      }
      catch (recoveryError) {
        failure = { error: new AggregateError([error, recoveryError], `Template registry transaction failed and file recovery needs attention: ${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}. Preserve the pending recovery record.`) }
      }
    }
  }
  const paths: string[] = []
  const errors: unknown[] = []
  const cleanup = async (filename: string, operation: () => Promise<unknown>) => {
    try {
      await operation()
    }
    catch (error) {
      paths.push(filename)
      errors.push(error)
    }
  }
  await cleanup(temporary, async () => await removeOwnedTemporary(temporary, temporaryOwner))
  if (!committed) {
    await Promise.all(written.map(target => cleanup(target, async () => await fs.rm(target, { force: true }))))
  }
  await cleanup(lockPath, async () => await lock.close())
  await cleanup(lockPath, async () => await removeOwnedLock(lockPath, lockToken))
  if (paths.length) {
    const cleanupError = new TemplateRegistryCleanupError([...new Set(paths)].sort(), errors)
    failure = { error: failure
      ? new AggregateError([failure.error, cleanupError], `${failure.error instanceof Error ? failure.error.message : 'Template registry transaction failed'}. ${cleanupError.message}`)
      : cleanupError }
  }
  if (failure) {
    throw failure.error
  }
  return result
}

export function canVerifyTemplateInstance(existing: TemplateInstance, next: TemplateInstance) {
  const identity = (instance: TemplateInstance) => JSON.stringify({
    target: instance.target,
    template: instance.template,
    profile: instance.generator.profile,
    parameters: instance.parameters,
    source: { kind: instance.source.kind, packageName: instance.source.packageName, version: instance.source.version, templatePath: instance.source.templatePath, remote: instance.source.remote },
  })
  return existing.baseline.status === 'unverified' && next.baseline.status === 'available' && identity(existing) === identity(next)
}

/** Generated IDs can opt into collision allocation under the lock; retries retain the existing target identity. */
export async function registerTemplateInstances(workspaceDir: string, drafts: TemplateInstanceDraft[], precondition?: (registry: TemplateInstanceRegistry) => Promise<void>, options: TemplateInstanceRegistrationOptions = {}) {
  return mutateTemplateRegistry(workspaceDir, async (registry) => {
    await precondition?.(registry)
    const registered = []
    const snapshots: Record<string, TemplateSnapshot> = {}
    for (const draft of drafts) {
      validateInstance(draft.instance)
      const target = await safeInstancePath(workspaceDir, draft.instance.target)
      const canonicalTarget = instanceRelativePath(await fs.realpath(workspaceDir), await fs.realpath(target))
      if (canonicalTarget !== draft.instance.target) {
        throw new Error(`Template instance target must use its canonical filesystem path: ${canonicalTarget}`)
      }
      const existing = registry.instances.find(instance => instance.target === draft.instance.target)
      if (existing) {
        if (canVerifyTemplateInstance(existing, draft.instance)) {
          Object.assign(existing, { ...draft.instance, id: existing.id, provenance: existing.provenance })
          Object.assign(snapshots, draft.snapshots)
          registered.push(existing)
          continue
        }
        if (JSON.stringify({ ...existing, id: '', provenance: '' }) !== JSON.stringify({ ...draft.instance, id: '', provenance: '' })) {
          throw new Error(`Template target is already registered with different provenance: ${draft.instance.target}`)
        }
        registered.push(existing)
        continue
      }
      if (registry.instances.some(instance => instance.target.startsWith(`${draft.instance.target}/`) || draft.instance.target.startsWith(`${instance.target}/`))) {
        throw new Error(`Template target overlaps an existing instance: ${draft.instance.target}`)
      }
      let id = draft.instance.id
      if (!options.allocateIdOnConflict && registry.instances.some(instance => instance.id === id)) {
        throw new Error(`Template instance identity is already registered at a different target: ${id}`)
      }
      for (let attempt = 1; registry.instances.some(instance => instance.id === id); attempt++) {
        id = createHash('sha256').update(JSON.stringify([draft.instance.id, draft.instance.target, attempt])).digest('hex').slice(0, 24)
      }
      const instance = { ...draft.instance, id }
      registry.instances.push(instance)
      Object.assign(snapshots, draft.snapshots)
      registered.push(instance)
    }
    for (const instance of registered) {
      if (instance.baseline.status === 'available') {
        for (const digest of [instance.baseline.original, instance.baseline.rendered]) {
          if (!snapshots[digest]) {
            await loadTemplateBaseline(workspaceDir, digest)
          }
        }
      }
    }
    return { result: registered, snapshots }
  })
}
