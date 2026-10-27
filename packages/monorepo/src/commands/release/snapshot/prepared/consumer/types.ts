import type { ConsumerPackageApplicability, PackageCheckCommand } from '../../../../package-check/types'
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
  /** 异平台产物仍已验证完整性，但不在当前宿主安装或执行。 */
  applicability?: ConsumerPackageApplicability[]
  commands: PackageCheckCommand[]
  error?: string
}
