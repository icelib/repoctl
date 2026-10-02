import type { OrganizationPresetSource } from '../../../types/presets'
import type { UpgradeMergeDetails } from '../../../types/upgrade'
import type { FileTransactionChange } from '../../file-transaction'

export interface OrganizationPresetAssetPlan {
  schemaVersion: 1
  kind: 'organization-preset-assets'
  rootDir: string
  status: 'ready' | 'unchanged' | 'blocked'
  sources: OrganizationPresetSource[]
  inputs: Array<{ path: string, hash: string }>
  locations: Array<{ packageName: string, fromDirectory: string, directory: string }>
  /** Root provider ownership must remain unchanged for the entire transaction. */
  ownership: Array<{ path: string, hash: string | null }>
  files: Array<{
    path: string
    source: { packageName: string, version: string, path: string }
    status: 'add' | 'modify' | 'identical' | 'conflict'
    beforeHash: string | null
    afterHash: string | null
    /** Exact resulting bytes, base64 encoded. */
    content: string | null
    diff: string | null
    reason: string
    merge?: UpgradeMergeDetails
    baseline?: FileTransactionChange
  }>
  conflicts: Array<{ path: string, reason: string }>
}

export interface OrganizationPresetAssetResult {
  status: 'applied' | 'unchanged'
  changed: string[]
}
