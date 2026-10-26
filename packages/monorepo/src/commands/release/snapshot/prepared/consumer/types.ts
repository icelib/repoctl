import type { PackageCheckCommand } from '../../../../package-check/types'
import type { ReleaseOptions } from '../../../types'
import type { PreparedSnapshotPublishReport } from '../publish/types'

export interface PreparedSnapshotConsumerOptions extends Pick<ReleaseOptions, 'env' | 'spawn' | 'sleep' | 'registryFetch'> {
  report: PreparedSnapshotPublishReport
  outputDirectory: string
}

export interface PreparedSnapshotConsumerReport {
  schemaVersion: 1
  status: 'verified' | 'failed'
  packages: Array<{ name: string, version: string }>
  commands: PackageCheckCommand[]
  error?: string
}
