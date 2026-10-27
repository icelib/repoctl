import type { ReleaseOidcAuditReport } from '../../../core/oidc/types'
import type { NightlyProvider } from '../../../types/config'
import type { ConsumerPackageApplicability, PackageCheckCommand } from '../../package-check/types'
import type { SnapshotOptions, SnapshotReport } from '../snapshot/types'
import type { ReleaseOptions } from '../types'

export interface NightlyOptions extends Pick<ReleaseOptions, 'cwd' | 'env' | 'spawn' | 'sleep' | 'registryFetch' | 'config'>, Pick<SnapshotOptions, 'referenceGitlinks' | 'prepareSource'> {
  /** Parent directory for retained reports and artifacts, outside the source checkout. */
  outputDirectory?: string
  /** Publish only with REPOCTL_SNAPSHOT_PUBLISH=1 in the authorized GitHub Actions job. */
  publish?: boolean
  /** Inspect the source and existing channel without building or publishing. */
  dryRun?: boolean
}

export interface NightlyPackage {
  name: string
  version: string
  locator: string
  integrity?: string
  published?: boolean
}

export interface NightlyConsumerReport {
  status: 'verified' | 'failed'
  packages: { name: string, version: string }[]
  /** 所有产物的静态检查保持不变，仅匹配宿主的包进入运行时消费。 */
  applicability?: ConsumerPackageApplicability[]
  commands: PackageCheckCommand[]
  error?: string
}

export interface NightlyReport {
  schemaVersion: 1
  status: 'planned' | 'skipped' | 'prepared' | 'published' | 'failed'
  provider: NightlyProvider
  repository: string
  branch: string
  eventName: string
  source: string
  commit: string
  buildId: string
  packages: NightlyPackage[]
  commands: PackageCheckCommand[]
  snapshot?: SnapshotReport
  outputDirectory?: string
  reason?: string
  error?: string
  latest?: Record<string, string | null>
  existing?: Record<string, string>
  oidc?: ReleaseOidcAuditReport
  confirmed?: boolean
  consumer?: NightlyConsumerReport
}
