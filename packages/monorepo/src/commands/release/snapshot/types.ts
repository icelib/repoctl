import type { PackageCheckResult } from '../../package-check/types'
import type { ReleasePlan } from '../plan'
import type { ReleaseOptions } from '../types'

export type SnapshotIdentity = { kind: 'pr', pullRequest: number, commit: string, buildId: string } | { kind: 'nightly', commit: string, buildId: string }

export interface SnapshotOptions extends Pick<ReleaseOptions, 'cwd' | 'env' | 'spawn' | 'sleep'> {
  identity: SnapshotIdentity
  /** 仅省略明确列出的参考 gitlink；默认拒绝所有 gitlink。 */
  referenceGitlinks?: readonly string[]
  /** 在隔离安装及版本改写后、构建前准备经验证的外部产物，仅供程序化调用。 */
  prepareSource?: (context: SnapshotPreparationContext) => Promise<SnapshotPreparationResult>
  /** Parent of a new isolated directory; must be outside the source repository. */
  outputDirectory?: string
  /** Explicit publication registry; defaults to the public npm registry. */
  registry?: string
  /** Publication additionally requires an explicitly authorized, trusted GitHub Actions job. */
  publish?: boolean
  /** Only inspect candidates and identity; do not install, build, pack or publish. */
  dryRun?: boolean
}

export interface SnapshotPackage {
  name: string
  directory: string
  currentVersion: string
  version: string
  reasons: string[]
  tarball?: string
  integrity?: string
  published?: boolean
}

export interface SnapshotReport {
  schemaVersion: 1
  identity: SnapshotIdentity
  identityKey: string
  source: string
  tag: string
  registry: string
  status: 'planned' | 'prepared' | 'published' | 'failed'
  packages: SnapshotPackage[]
  nativePlan: ReleasePlan
  install: { executable: 'pnpm', args: string[] }
  installCommand: string
  outputDirectory?: string
  checks?: PackageCheckResult[]
  /** 准确提交的真实 Git tree，包含被明确省略的 gitlink 身份。 */
  sourceTree?: string
  referenceGitlinks?: SnapshotReferenceGitlink[]
  preparation?: SnapshotPreparationReceipt
  error?: string
}

export interface SnapshotReferenceGitlink {
  path: string
  commit: string
}

export interface SnapshotPreparationContext {
  /** 隔离归档目录；不能更改其中已经存在的源码、配置或 manifest。 */
  directory: string
  identity: Readonly<SnapshotIdentity>
  tree: string
  packages: readonly Readonly<Pick<SnapshotPackage, 'name' | 'directory' | 'currentVersion' | 'version'>>[]
  referenceGitlinks: readonly Readonly<SnapshotReferenceGitlink>[]
}

export interface SnapshotPreparationResult {
  /** 新增产物的完整清单；路径为归档根目录内使用 / 的逻辑相对路径。 */
  files: readonly { path: string, sha256: string }[]
  /** 用于审计的字符串元数据，不作为发布授权。 */
  metadata?: Readonly<Record<string, string>>
}

export interface SnapshotPreparationReceipt extends SnapshotPreparationResult {
  commit: string
  tree: string
}
