import type { FileTransactionChange } from '../../file-transaction'
import type { OrganizationPresetAssetPlan, OrganizationPresetAssetResult } from './types'
import { readFile, realpath } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import path from 'pathe'
import { writeFileTransaction } from '../../file-transaction'
import { canonicalDirectory, hash, readOptional } from '../../file-transaction/paths'
import { withOperationLock } from '../../operation-lock'
import { installedPresetDirectory } from '../files'
import { planOrganizationPresetAssets } from './plan'

export async function applyOrganizationPresetAssets(plan: OrganizationPresetAssetPlan): Promise<OrganizationPresetAssetResult> {
  if (!plan || plan.schemaVersion !== 1 || plan.kind !== 'organization-preset-assets' || typeof plan.rootDir !== 'string' || !Array.isArray(plan.files)) {
    throw new Error('Unsupported organization preset asset plan')
  }
  if (plan.status === 'blocked') {
    throw new Error('Organization preset asset plan is blocked')
  }
  if (await canonicalDirectory(plan.rootDir) !== plan.rootDir) {
    throw new Error('Organization preset workspace changed')
  }
  return withOperationLock(plan.rootDir, 'upgrade', async () => {
    const fresh = await planOrganizationPresetAssets(plan.rootDir, plan.targets)
    const outcomes = (value: OrganizationPresetAssetPlan) => value.files.map(file => ({ path: file.path, source: file.source, afterHash: file.afterHash, content: file.content, baseline: file.baseline ? { path: file.baseline.path, afterHash: file.baseline.afterHash, content: file.baseline.content } : null }))
    if (fresh.status === 'unchanged' && isDeepStrictEqual([fresh.sources, fresh.inputs, fresh.locations, fresh.ownership, outcomes(fresh)], [plan.sources, plan.inputs, plan.locations, plan.ownership, outcomes(plan)])) {
      return { status: 'unchanged', changed: [] }
    }
    if (!isDeepStrictEqual(fresh, plan)) {
      throw new Error('Organization preset plan changed; review a new plan before applying')
    }
    if (fresh.status === 'unchanged') {
      return { status: 'unchanged', changed: [] }
    }
    const updates: FileTransactionChange[] = fresh.files.filter(file => file.beforeHash !== file.afterHash).map(file => ({ path: file.path, beforeHash: file.beforeHash, afterHash: file.afterHash, content: file.content }))
    // Baselines are last: their upstream identity never advances before managed files.
    updates.push(...fresh.files.flatMap(file => file.baseline && file.baseline.beforeHash !== file.baseline.afterHash ? [file.baseline] : []))
    const stableFiles = [
      ...fresh.ownership,
      ...fresh.files.filter(file => file.beforeHash === file.afterHash).map(file => ({ path: file.path, hash: file.beforeHash })),
      ...fresh.files.flatMap(file => file.baseline && file.baseline.beforeHash === file.baseline.afterHash ? [{ path: file.baseline.path, hash: file.baseline.beforeHash }] : []),
    ]
    const verify = async () => {
      for (const input of fresh.inputs) {
        if (path.normalize(await realpath(input.path)) !== input.path || hash(await readFile(input.path)) !== input.hash) {
          throw new Error('Preset source or configuration changed during application')
        }
      }
      for (const location of fresh.locations) {
        // Exact installed identity cannot be replaced with another package link during a write.
        if (await installedPresetDirectory(location.packageName, location.fromDirectory) !== location.directory) {
          throw new Error('Installed preset location changed during application')
        }
      }
      for (const file of stableFiles) {
        const current = await readOptional(fresh.rootDir, file.path)
        if ((current ? hash(current) : null) !== file.hash) {
          throw new Error(`Preset ownership or unchanged asset changed: ${file.path}`)
        }
      }
    }
    await writeFileTransaction(fresh.rootDir, updates, { verify })
    return { status: 'applied', changed: updates.map(file => file.path) }
  })
}
