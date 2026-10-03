import type { GeneratedTemplateInstanceOptions, TemplateInstanceDraft, TemplateInstanceInfo } from './types'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { exists, instanceRelativePath, safeInstancePath } from './paths'
import { generationParameters } from './schema'
import { captureTemplateSnapshot, snapshotDigest, writeTemplateSnapshot } from './snapshot'
import { readTemplatePackageVersion } from './source'
import { loadTemplateBaseline, loadTemplateInstanceRegistry, mutateTemplateRegistry, registerTemplateInstances } from './store'

export function templateInstanceId(target: string, template: string) {
  return createHash('sha256').update(JSON.stringify([target, template])).digest('hex').slice(0, 24)
}

/** Reserve a new directory only when no existing instance owns its path. */
export async function createTemplateInstanceTarget(workspaceDir: string, relative: string) {
  const target = await safeInstancePath(workspaceDir, relative)
  const registry = await loadTemplateInstanceRegistry(workspaceDir)
  const owner = registry.instances.find(instance => instance.target === relative || instance.target.startsWith(`${relative}/`) || relative.startsWith(`${instance.target}/`))
  if (owner) {
    throw new Error(`Template target is already owned by retained instance ${owner.id} at ${owner.target}: ${relative}. Inspect it with repo templates instances ${owner.id} --json. Removing a directory retains its provenance and baselines. Restore the original project from version control or a backup, explicitly relocate a verified moved instance, or choose a different unowned path for a new project.`)
  }
  await fs.mkdir(path.dirname(target), { recursive: true })
  // An exclusive leaf prevents a concurrent creator from overwriting an existing project.
  await fs.mkdir(target)
  return target
}

export async function prepareGeneratedTemplateInstance(options: GeneratedTemplateInstanceOptions): Promise<TemplateInstanceDraft> {
  const requested = instanceRelativePath(options.workspaceDir, options.targetDir)
  const safeTarget = await safeInstancePath(options.workspaceDir, requested)
  const target = instanceRelativePath(await fs.realpath(options.workspaceDir), await fs.realpath(safeTarget))
  const rendered = await captureTemplateSnapshot(safeTarget)
  const originalDigest = snapshotDigest(options.preparedSource.snapshot)
  const renderedDigest = snapshotDigest(rendered)
  return {
    instance: {
      id: templateInstanceId(target, options.template),
      target,
      template: options.template,
      provenance: 'created',
      source: options.preparedSource.source,
      generator: { profile: options.profile, version: options.generatorVersion ?? await readTemplatePackageVersion() },
      parameters: generationParameters(options.parameters),
      baseline: { status: 'available', original: originalDigest, rendered: renderedDigest },
    },
    snapshots: { [originalDigest]: options.preparedSource.snapshot, [renderedDigest]: rendered },
  }
}

export async function recordGeneratedTemplateInstance(options: GeneratedTemplateInstanceOptions) {
  const draft = await prepareGeneratedTemplateInstance(options)
  return (await registerTemplateInstances(options.workspaceDir, [draft]))[0]!
}

export async function listTemplateInstances(workspaceDir: string): Promise<TemplateInstanceInfo[]> {
  const registry = await loadTemplateInstanceRegistry(workspaceDir)
  return Promise.all(registry.instances.map(async (instance) => {
    let targetStatus: TemplateInstanceInfo['targetStatus'] = 'unsafe'
    try {
      const target = await safeInstancePath(workspaceDir, instance.target)
      targetStatus = await exists(target) ? (await fs.lstat(target)).isDirectory() ? 'present' : 'unsafe' : 'missing'
    }
    catch { /* Report unsafe targets without traversing them. */ }
    let baselineStatus: TemplateInstanceInfo['baselineStatus'] = instance.baseline.status
    if (instance.baseline.status === 'available') {
      try {
        await loadTemplateBaseline(workspaceDir, instance.baseline.original)
        await loadTemplateBaseline(workspaceDir, instance.baseline.rendered)
      }
      catch {
        baselineStatus = 'unavailable'
      }
    }
    return { instance, targetStatus, baselineStatus }
  }))
}

export async function rebuildTemplateInstanceBaseline(workspaceDir: string, id: string, targetDir: string, layer: 'original' | 'rendered' = 'rendered') {
  const registry = await loadTemplateInstanceRegistry(workspaceDir)
  const instance = registry.instances.find(item => item.id === id || item.target === id)
  if (!instance) {
    throw new Error(`Unknown template instance: ${id}`)
  }
  if (instance.baseline.status !== 'available') {
    throw new Error(`Template instance ${instance.target} has no verified baseline; reliable upgrades are unavailable.`)
  }
  await writeTemplateSnapshot(await loadTemplateBaseline(workspaceDir, instance.baseline[layer]), targetDir)
  return instance
}

/** Relocation never guesses based on a package name; all retained baseline files must identify the instance. */
export async function relocateTemplateInstance(workspaceDir: string, id: string, target: string, apply = false) {
  const destination = await safeInstancePath(workspaceDir, target)
  target = instanceRelativePath(await fs.realpath(workspaceDir), await fs.realpath(destination))
  const inspect = async () => {
    const registry = await loadTemplateInstanceRegistry(workspaceDir)
    const instance = registry.instances.find(item => item.id === id || item.target === id)
    if (!instance) {
      throw new Error(`Unknown template instance: ${id}`)
    }
    if (instance.target === target) {
      return { instance, target, changed: false }
    }
    if (await exists(await safeInstancePath(workspaceDir, instance.target))) {
      throw new Error('The registered target still exists; relocation requires a missing original target.')
    }
    if (instance.baseline.status !== 'available') {
      throw new Error('Cannot verify relocation without an available baseline.')
    }
    await loadTemplateBaseline(workspaceDir, instance.baseline.rendered)
    const destination = await captureTemplateSnapshot(await safeInstancePath(workspaceDir, target))
    if (snapshotDigest(destination) !== instance.baseline.rendered) {
      throw new Error('Relocation cannot verify this destination as the same instance: its files differ from the retained baseline.')
    }
    if (registry.instances.some(item => item.id !== instance.id && (item.target === target || item.target.startsWith(`${target}/`) || target.startsWith(`${item.target}/`)))) {
      throw new Error('Relocation target overlaps a registered instance.')
    }
    return { instance, target, changed: true }
  }
  if (!apply) {
    return { ...await inspect(), applied: false }
  }
  return mutateTemplateRegistry(workspaceDir, async (registry) => {
    const result = await inspect()
    if (result.changed) {
      registry.instances.find(item => item.id === result.instance.id)!.target = target
    }
    return { result: { ...result, applied: true } }
  })
}
