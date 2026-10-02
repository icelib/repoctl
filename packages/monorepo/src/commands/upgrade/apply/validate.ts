import type { UpgradePlan } from '../../../types/upgrade'
import { Buffer } from 'node:buffer'
import { hash, relativeFile } from '../plan/files'

export const actionable = (file: UpgradePlan['files'][number]) => ['add', 'modify', 'delete'].includes(file.status)
const digest = (value: unknown) => value === null || (typeof value === 'string' && /^[\da-f]{64}$/.test(value))

export function validateUpgradePlan(plan: UpgradePlan) {
  if (!plan || plan.schemaVersion !== 1 || plan.status !== 'ready' || !Array.isArray(plan.files) || !Array.isArray(plan.inputs)
    || typeof plan.cwd !== 'string' || typeof plan.rootDir !== 'string' || typeof plan.assetDir !== 'string'
    || !Array.isArray(plan.blockers) || plan.blockers.length
    || plan.files.some(file => !file || typeof file !== 'object') || plan.inputs.some(input => !input || typeof input !== 'object')
    || new Set(plan.files.map(file => file.path)).size !== plan.files.length
    || new Set(plan.inputs.map(input => `${input.area}:${input.path}`)).size !== plan.inputs.length) {
    throw new Error('Invalid or blocked upgrade plan.')
  }
  if (plan.discovery !== null && (!plan.discovery || !Array.isArray(plan.discovery.manifests)
    || plan.discovery.manifests.some(filename => typeof filename !== 'string')
    || (plan.discovery.patterns !== null && (!Array.isArray(plan.discovery.patterns) || plan.discovery.patterns.some(pattern => typeof pattern !== 'string'))))) {
    throw new Error('Invalid upgrade discovery precondition.')
  }
  for (const input of plan.inputs) {
    if (!['target', 'asset', 'config'].includes(input.area) || typeof input.path !== 'string' || !digest(input.hash)) {
      throw new Error('Invalid upgrade input.')
    }
  }
  for (const file of plan.files) {
    relativeFile(file.path)
    if (!['add', 'modify', 'delete', 'identical', 'skip'].includes(file.status) || !digest(file.beforeHash) || !digest(file.afterHash)
      || (file.content !== null && typeof file.content !== 'string') || (file.group !== null && typeof file.group !== 'string')) {
      throw new Error('Invalid upgrade file.')
    }
    const input = plan.inputs.find(item => item.area === 'target' && item.path === file.path)
    if (!input || input.hash !== file.beforeHash) {
      throw new Error(`Missing upgrade precondition: ${file.path}`)
    }
    if (actionable(file)) {
      if (file.beforeHash === file.afterHash) {
        throw new Error(`Unchanged file cannot be an upgrade action: ${file.path}`)
      }
      if (file.status === 'delete'
        ? file.afterHash !== null || file.content !== null || file.beforeHash === null
        : file.content === null || hash(Buffer.from(file.content, 'base64')) !== file.afterHash
          || (file.status === 'add' ? file.beforeHash !== null : file.beforeHash === null)) {
        throw new Error(`Invalid upgrade content: ${file.path}`)
      }
    }
  }
}
