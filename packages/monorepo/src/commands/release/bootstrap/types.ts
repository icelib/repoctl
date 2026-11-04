import type { ConsumerEntry, ConsumerPackageApplicability, PackageCheckCommand, PackageCheckResult, PackedManifest } from '../../package-check/types'
import type { ReleaseOptions } from '../types'

/** 默认分支工作流在执行候选代码前冻结的 GitHub 身份。 */
export interface BootstrapSource {
  repository: string
  repositoryId: number
  commit: string
  branch: string
  runId: number
  runAttempt: number
  workflowRef: string
}

/** 新公开包的单包预发布参数，不参与工作区批量版本求解。 */
export interface BootstrapOptions extends Pick<ReleaseOptions, 'cwd' | 'env' | 'spawn' | 'sleep' | 'registryFetch'> {
  packageName: string
  version: string
  tag?: string
  registry?: string
  source?: BootstrapSource
  outputDirectory?: string
  /** 结构化报告模式下抑制发布过程输出。 */
  quiet?: boolean
  dryRun?: boolean
  token?: string
  runId?: number
  runAttempt?: number
  verifyRunId?: number
  fetch?: typeof globalThis.fetch
}

export interface BootstrapPackage {
  name: string
  directory: string
  currentVersion: string
  version: string
  tarball?: string
  integrity?: string
  files?: string[]
}

/** 只读计划中所有目录都相对于冻结仓库根目录。 */
export interface BootstrapPlan {
  schemaVersion: 1
  source: BootstrapSource
  package: BootstrapPackage
  registry: 'https://registry.npmjs.org/'
  tag: string
  pnpmVersion: string
  buildDirectories: string[]
  protectedTags: string[]
}

/** 可跨作业传递的纯数据合同；不携带候选源码或发布凭据。 */
export interface BootstrapManifest extends Omit<BootstrapPlan, 'package'> {
  package: BootstrapPackage & { tarball: 'tarballs/package.tgz', integrity: string, files: string[] }
  checks: { build: 'passed', package: PackageCheckResult }
  entries: ConsumerEntry[]
  packedManifest: PackedManifest
}

export interface BootstrapConsumerReport {
  status: 'passed' | 'failed'
  commands: PackageCheckCommand[]
  packages: Array<{ name: string, version: string }>
  applicability?: ConsumerPackageApplicability[]
  error?: string
}

export interface BootstrapReport {
  schemaVersion: 1
  status: 'planned' | 'prepared' | 'published' | 'verified' | 'failed'
  plan: BootstrapPlan
  manifest?: BootstrapManifest
  outputDirectory?: string
  checks?: PackageCheckResult[]
  accepted?: boolean
  confirmed?: boolean
  baselineTags?: Record<string, string>
  latestState?: { before: string | null, after: string | null, bootstrapPromoted: boolean }
  provenance?: { url: string, predicateType: string }
  verification?: { sourceRunId: number, sourceRunAttempt: number, artifactId: number, artifactDigest: string, runId: number, runAttempt: number, checkedAt: string }
  consumer?: BootstrapConsumerReport
  error?: string
}

export interface PrepareBootstrapOptions extends BootstrapOptions {
  plan: BootstrapPlan
}
