import type { TemplateInstance, TemplateInstanceDraft, TemplateInstanceReplacementHooks } from './types'
import { validateInstance } from './schema'
import { snapshotDigest, validateSnapshot } from './snapshot'
import { loadTemplateBaseline, mutateTemplateRegistry } from './store'

/** Replace exactly one instance, rolling file mutations back before releasing the registry lock on failure. */
export async function replaceTemplateInstance(workspaceDir: string, before: TemplateInstance, draft: TemplateInstanceDraft, hooks: TemplateInstanceReplacementHooks) {
  validateInstance(draft.instance)
  const identity = (instance: TemplateInstance) => JSON.stringify([instance.id, instance.target, instance.template, instance.provenance, instance.generator.profile])
  if (identity(before) !== identity(draft.instance) || draft.instance.baseline.status !== 'available') {
    throw new Error('An instance upgrade must preserve its identity and provide a reliable target baseline.')
  }
  for (const [digest, snapshot] of Object.entries(draft.snapshots)) {
    validateSnapshot(snapshot)
    if (snapshotDigest(snapshot) !== digest) {
      throw new Error('Replacement baseline digest does not match its content.')
    }
  }
  return mutateTemplateRegistry(workspaceDir, async (registry) => {
    const index = registry.instances.findIndex(instance => instance.id === before.id)
    if (index < 0 || JSON.stringify(registry.instances[index]) !== JSON.stringify(before)) {
      throw new Error('Template instance changed before the transaction; preview again.')
    }
    if (draft.instance.baseline.status === 'available') {
      for (const digest of [draft.instance.baseline.original, draft.instance.baseline.rendered]) {
        if (!draft.snapshots[digest]) {
          await loadTemplateBaseline(workspaceDir, digest)
        }
      }
    }
    await hooks.apply()
    registry.instances[index] = draft.instance
    return { result: draft.instance, snapshots: draft.snapshots }
  }, hooks)
}
