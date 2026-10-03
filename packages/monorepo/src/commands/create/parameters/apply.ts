import type { FileTransactionChange } from '../../../core/file-transaction'
import type { Identity, OwnedDirectory } from '../../../core/file-transaction/state'
import type { CreateNewProjectPlan } from '../plan'
import { Buffer } from 'node:buffer'
import { lstat, mkdir, open } from 'node:fs/promises'
import { captureTemplateSnapshot, instanceRelativePath, prepareTemplateInstanceSource, registerTemplateInstances, safeInstancePath, snapshotDigest } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import { writeFileTransaction } from '../../../core/file-transaction'
import { canonicalDirectory, checkedFile, hash, readOptional } from '../../../core/file-transaction/paths'
import { cleanDirectories, ensureParent } from '../../../core/file-transaction/state'
import { planWorkspaceManifest } from '../workspace'
import { getPreparedCreateParameters } from './prepare'
import { stageParameterizedProject } from './stage'

export async function applyParameterizedProject(plan: CreateNewProjectPlan, gitMetadata: boolean) {
  const prepared = getPreparedCreateParameters(plan)
  const root = await canonicalDirectory(plan.cwd)
  const target = instanceRelativePath(plan.cwd, plan.targetDir)
  const targetDir = await safeInstancePath(root, target)
  const verifySource = async () => {
    if (snapshotDigest((await prepareTemplateInstanceSource(plan.sourceDir)).snapshot) !== snapshotDigest(prepared.source.snapshot)) {
      throw new Error('Template source changed after parameter preview. Resolve a fresh plan.')
    }
  }
  await verifySource()
  const staged = await stageParameterizedProject(plan, prepared, target, gitMetadata)
  const workspace = await planWorkspaceManifest(root, plan.targetName)
  const updates: FileTransactionChange[] = staged.snapshot.files.map(file => ({ path: `${target}/${file.path}`, beforeHash: null, afterHash: hash(Buffer.from(file.content, 'base64')), content: file.content }))
  const workspaceChanged = (workspace.before?.toString('base64') ?? null) !== (workspace.after?.toString('base64') ?? null)
  if (workspaceChanged) {
    updates.push({ path: 'pnpm-workspace.yaml', beforeHash: workspace.before ? hash(workspace.before) : null, afterHash: workspace.after ? hash(workspace.after) : null, content: workspace.after?.toString('base64') ?? null })
  }
  const directories: OwnedDirectory[] = []
  let fileIdentities = new Map<string, Identity>()
  let targetOwner: { ino: bigint, dev: bigint } | undefined
  let attempted = false
  const verifyFile = async (relative: string) => {
    const owner = fileIdentities.get(relative)
    const filename = await checkedFile(root, relative)
    const current = await lstat(filename, { bigint: true })
    if (!owner || current.dev !== owner.dev || current.ino !== owner.ino) {
      throw new Error(`Concurrent replacement retained; review creation recovery at ${target}`)
    }
    return filename
  }
  const verifyTarget = async () => {
    const current = await lstat(await safeInstancePath(root, target), { bigint: true })
    if (!targetOwner || !current.isDirectory() || current.isSymbolicLink() || current.ino !== targetOwner.ino || current.dev !== targetOwner.dev) {
      throw new Error('Creation target changed concurrently; preserve it and review a new plan.')
    }
  }
  const rollback = async () => {
    if (!targetOwner) {
      await cleanDirectories(directories)
      return
    }
    await verifyTarget()
    if (attempted) {
      const reversed: FileTransactionChange[] = []
      for (const update of [...updates].reverse()) {
        const current = await readOptional(root, update.path)
        const currentHash = current ? hash(current) : null
        if (currentHash === update.beforeHash) {
          continue
        }
        if (currentHash !== update.afterHash) {
          throw new Error(`Concurrent edit retained; review creation recovery at ${target}`)
        }
        await verifyFile(update.path)
        reversed.push({ path: update.path, beforeHash: update.afterHash, afterHash: update.beforeHash, content: update.path === 'pnpm-workspace.yaml' ? workspace.before?.toString('base64') ?? null : null })
      }
      await writeFileTransaction(root, reversed, { verify: verifyTarget })
    }
    await cleanDirectories(directories)
    try {
      await lstat(targetDir)
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return
      }
      throw error
    }
    throw new Error(`Creation files were rolled back; concurrent or nonempty directories were retained at ${target}`)
  }
  await registerTemplateInstances(root, [staged.draft], async (registry) => {
    if (registry.instances.some(instance => instance.target === target || instance.target.startsWith(`${target}/`) || target.startsWith(`${instance.target}/`))) {
      throw new Error('Creation target overlaps a registered template instance.')
    }
    await verifySource()
    await ensureParent(path.dirname(targetDir), directories)
    await mkdir(targetDir)
    targetOwner = await lstat(targetDir, { bigint: true })
    directories.push({ path: targetDir, identity: targetOwner })
    for (const directory of staged.snapshot.directories) {
      await ensureParent(path.join(targetDir, directory), directories)
    }
    attempted = true
    fileIdentities = await writeFileTransaction(root, updates, { verify: verifyTarget })
    for (const file of staged.snapshot.files) {
      const relative = `${target}/${file.path}`
      const handle = await open(await verifyFile(relative), 'r')
      try {
        const current = await handle.stat({ bigint: true })
        const owner = fileIdentities.get(relative)!
        if (current.nlink !== 1n || current.dev !== owner.dev || current.ino !== owner.ino) {
          throw new Error(`Concurrent replacement retained; review creation recovery at ${target}`)
        }
        await handle.chmod(file.executable ? 0o755 : 0o644)
      }
      finally {
        await handle.close()
      }
    }
    await verifySource()
    await verifyTarget()
    for (const update of updates) {
      await verifyFile(update.path)
    }
    if (snapshotDigest(await captureTemplateSnapshot(targetDir)) !== snapshotDigest(staged.snapshot)) {
      throw new Error('Created files changed before provenance registration; concurrent edits will be preserved.')
    }
  }, { allocateIdOnConflict: true, rollback, committed: async () => {} })
}
