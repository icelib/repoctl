import type { TemplateInstanceMovePlan, TemplateInstanceRegistry, TemplateInstanceReplacementHooks } from './types'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { portableRelativePath, safeInstancePath } from './paths'
import { parseRegistry } from './schema'
import { loadTemplateInstanceRegistry, mutateTemplateRegistry, TemplateRegistryCleanupError } from './store'

function fingerprint(registry: TemplateInstanceRegistry) {
  const instances = [...registry.instances].sort((a, b) => a.target < b.target ? -1 : a.target > b.target ? 1 : 0)
  return createHash('sha256').update(JSON.stringify({ ...registry, instances })).digest('hex')
}

function inside(target: string, parent: string) {
  return target === parent || target.startsWith(`${parent}/`)
}

function inspectMove(registry: TemplateInstanceRegistry, from: string, to: string): TemplateInstanceMovePlan {
  portableRelativePath(from)
  portableRelativePath(to)
  const owner = registry.instances.find(instance => instance.target !== from && inside(from.toLowerCase(), instance.target.toLowerCase()))
  if (owner) {
    throw new Error(`Workspace ${from} belongs to parent template instance ${owner.id} (${owner.target}); moving only part of an instance requires an explicit ownership review.`)
  }
  if (registry.instances.some(instance => !inside(instance.target, from)
    && (inside(to.toLowerCase(), instance.target.toLowerCase()) || inside(instance.target.toLowerCase(), to.toLowerCase())))) {
    throw new Error(`Template move destination overlaps a registered instance, including retained missing records: ${to}`)
  }
  const relocations = registry.instances.filter(instance => inside(instance.target, from))
    .map(instance => ({ id: instance.id, from: instance.target, to: to + instance.target.slice(from.length) }))
    .sort((a, b) => a.id.localeCompare(b.id))
  const after: TemplateInstanceRegistry = {
    ...registry,
    instances: registry.instances.map(instance => ({ ...instance, target: relocations.find(item => item.id === instance.id)?.to ?? instance.target })),
  }
  parseRegistry(JSON.stringify(after))
  for (const relocation of relocations) {
    if (after.instances.some(instance => instance.id !== relocation.id
      && (inside(instance.target.toLowerCase(), relocation.to.toLowerCase()) || inside(relocation.to.toLowerCase(), instance.target.toLowerCase())))) {
      throw new Error(`Template move destination overlaps a registered instance, including retained missing records: ${relocation.to}`)
    }
  }
  return { from, to, beforeHash: fingerprint(registry), afterHash: fingerprint(after), relocations }
}

function reversePlan(plan: TemplateInstanceMovePlan): TemplateInstanceMovePlan {
  return {
    from: plan.to,
    to: plan.from,
    beforeHash: plan.afterHash,
    afterHash: plan.beforeHash,
    relocations: plan.relocations.map(item => ({ id: item.id, from: item.to, to: item.from })),
  }
}

/** Preview target changes without treating business edits as a new template baseline. */
export async function planTemplateInstanceMove(workspaceDir: string, from: string, to: string): Promise<TemplateInstanceMovePlan> {
  const plan = inspectMove(await loadTemplateInstanceRegistry(workspaceDir), from, to)
  for (const relocation of plan.relocations) {
    await safeInstancePath(workspaceDir, relocation.to)
  }
  return plan
}

/** Hold the registry lock through file mutation, registry commit and any rollback, including moves with no registered instances. */
export async function moveTemplateInstances(workspaceDir: string, plan: TemplateInstanceMovePlan, hooks: TemplateInstanceReplacementHooks, replay = false): Promise<string[]> {
  let committed = false
  try {
    await mutateTemplateRegistry(workspaceDir, async (registry) => {
      const expected = replay ? plan.afterHash : plan.beforeHash
      if (fingerprint(registry) !== expected) {
        throw new Error('Template instance registry changed before the workspace move; preview again.')
      }
      const current = replay ? reversePlan(inspectMove(registry, plan.to, plan.from)) : inspectMove(registry, plan.from, plan.to)
      if (!isDeepStrictEqual(current, plan)) {
        throw new Error('Template instance move plan changed or is invalid; preview again.')
      }
      for (const relocation of plan.relocations) {
        await safeInstancePath(workspaceDir, relocation.to)
      }
      await hooks.apply()
      if (!replay) {
        for (const relocation of plan.relocations) {
          registry.instances.find(instance => instance.id === relocation.id)!.target = relocation.to
        }
      }
      if (fingerprint(registry) !== plan.afterHash) {
        throw new Error('Template instance registry does not match the reviewed move result.')
      }
      return { result: undefined }
    }, {
      rollback: hooks.rollback,
      committed: async () => {
        committed = true
        await hooks.committed()
      },
    })
    return []
  }
  catch (error) {
    if (committed && error instanceof TemplateRegistryCleanupError) {
      return error.paths
    }
    throw error
  }
}
