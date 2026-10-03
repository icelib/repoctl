import type { ToolingCapabilityPlan, ToolingCapabilityResult } from './types'
import { Buffer } from 'node:buffer'
import { isDeepStrictEqual } from 'node:util'
import { writeFileTransaction } from '../../core/file-transaction'
import { hash, readOptional } from '../../core/file-transaction/paths'
import { withOperationLock } from '../../core/operation-lock'
import { planToolingCapability } from './plan'

export async function applyToolingCapability(plan: ToolingCapabilityPlan): Promise<ToolingCapabilityResult> {
  if (!plan || plan.schemaVersion !== 1 || !['playwright', 'storybook'].includes(plan.capability?.id) || !Array.isArray(plan.files)) {
    throw new Error('Unsupported tooling capability plan')
  }
  if (plan.status === 'blocked') {
    throw new Error('Tooling capability plan is blocked; resolve conflicts before applying')
  }
  return withOperationLock(plan.rootDir, 'tooling-capability', async () => {
    const fresh = await planToolingCapability(plan.rootDir, plan.options)
    const sameAssets = isDeepStrictEqual(fresh.files.map(file => [file.path, file.afterHash]), plan.files.map(file => [file.path, file.afterHash]))
    // An already-applied plan remains idempotent; every other stale input is rejected.
    if (fresh.status === 'unchanged' && sameAssets && isDeepStrictEqual(fresh.target, plan.target)) {
      return { status: 'unchanged', changed: [], nextSteps: fresh.nextSteps }
    }
    if (!isDeepStrictEqual(fresh, plan)) {
      throw new Error('Tooling capability plan changed; review a new plan before applying')
    }
    const changes = fresh.files.filter(file => file.status !== 'identical').map(file => ({ path: file.path, beforeHash: file.beforeHash, afterHash: file.afterHash, content: Buffer.from(file.after).toString('base64') }))
    const verify = async () => {
      const target = await readOptional(plan.rootDir, `${plan.target.directory}/package.json`)
      if (!target || hash(target) !== plan.target.manifestHash) {
        throw new Error('Target workspace changed during capability application')
      }
      for (const file of fresh.files.filter(file => file.status === 'identical')) {
        const current = await readOptional(plan.rootDir, file.path)
        if (!current || hash(current) !== file.beforeHash) {
          throw new Error(`Capability input changed during application: ${file.path}`)
        }
      }
    }
    await writeFileTransaction(plan.rootDir, changes, { verify })
    return { status: 'applied', changed: changes.map(file => file.path), nextSteps: fresh.nextSteps }
  })
}
