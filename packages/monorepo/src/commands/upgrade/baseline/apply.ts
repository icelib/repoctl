import type { UpgradeFilePlan, UpgradePlan } from '../../../types/upgrade'
import { Buffer } from 'node:buffer'
import { hash } from '../plan/files'
import { baselinePath, isRootAsset, parseBaseline } from './record'

export const writesAsset = (file: UpgradeFilePlan) => ['add', 'modify', 'delete'].includes(file.status)

/** Materialize only reviewed records belonging to selected, successful assets. */
export function upgradeOperations(files: UpgradeFilePlan[]): UpgradeFilePlan[] {
  return files.flatMap((file) => {
    const operations = writesAsset(file) ? [file] : []
    if (file.baseline) {
      const baseline = file.baseline
      operations.push({ ...baseline, status: baseline.afterHash === null ? 'delete' : baseline.beforeHash === null ? 'add' : 'modify', reason: 'root-asset-baseline', detail: `Upstream baseline for ${file.path}`, binary: false, diff: null, group: file.group, automatic: file.automatic })
    }
    return operations
  })
}

export function validateBaselineChange(file: UpgradeFilePlan, plan: UpgradePlan) {
  const change = file.baseline
  if (!change) {
    return
  }
  const digest = (value: unknown) => value === null || (typeof value === 'string' && /^[\da-f]{64}$/.test(value))
  if (!['add', 'modify', 'delete', 'identical'].includes(file.status) || !isRootAsset(file.path)
    || change.path !== baselinePath(file.path) || !digest(change.beforeHash) || !digest(change.afterHash)
    || change.beforeHash === change.afterHash
    || (change.content !== null && typeof change.content !== 'string')
    || !plan.inputs.some(input => input.area === 'target' && input.path === change.path && input.hash === change.beforeHash)
    || plan.files.some(other => other.path === change.path)) {
    throw new Error(`Invalid baseline operation: ${file.path}`)
  }
  if (change.content === null) {
    if (change.afterHash !== null || file.afterHash !== null) {
      throw new Error(`Invalid baseline removal: ${file.path}`)
    }
    return
  }
  const content = Buffer.from(change.content, 'base64')
  if (content.toString('base64') !== change.content || hash(content) !== change.afterHash || file.afterHash === null) {
    throw new Error(`Invalid baseline content: ${file.path}`)
  }
  const record = parseBaseline(content, change.path)
  if (!plan.inputs.some(input => input.area === 'asset' && input.path === record.source.assetPath && input.hash === record.source.hash)) {
    throw new Error(`Missing baseline source precondition: ${file.path}`)
  }
}
