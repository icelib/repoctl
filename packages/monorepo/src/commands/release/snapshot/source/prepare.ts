import type { SnapshotOptions, SnapshotPreparationContext, SnapshotPreparationReceipt, SnapshotReport } from '../types'
import { sourceInventory } from './inventory'
import { sourceRelativePath } from './paths'
import { assertOmittedReferences } from './references'

function preparationContext(directory: string, report: SnapshotReport): SnapshotPreparationContext {
  if (!report.sourceTree) {
    throw new Error('Snapshot source preparation requires verified Git tree evidence.')
  }
  return Object.freeze({
    directory,
    identity: Object.freeze({ ...report.identity }),
    tree: report.sourceTree,
    packages: Object.freeze(report.packages.map(({ name, directory, currentVersion, version }) => Object.freeze({ name, directory, currentVersion, version }))),
    referenceGitlinks: Object.freeze((report.referenceGitlinks ?? []).map(reference => Object.freeze({ ...reference }))),
  })
}

/** 回调与构建脚本具有相同信任级别；receipt 验证产物契约，不提供代码沙箱。 */
export async function prepareSnapshotSource(directory: string, report: SnapshotReport, options: SnapshotOptions) {
  delete report.preparation
  if (!options.prepareSource) {
    return
  }
  if (typeof options.prepareSource !== 'function') {
    throw new TypeError('Snapshot prepareSource must be a programmatic function.')
  }
  const before = await sourceInventory(directory)
  const result = await options.prepareSource(preparationContext(directory, report))
  if (!result || typeof result !== 'object' || !Array.isArray(result.files)
    || Object.keys(result).some(key => !['files', 'metadata'].includes(key))) {
    throw new TypeError('Snapshot prepareSource must return a complete files receipt.')
  }
  const declared = new Map<string, string>()
  for (const file of result.files) {
    const relative = sourceRelativePath(file?.path)
    if (!file || Object.keys(file).some(key => !['path', 'sha256'].includes(key)) || !/^[a-f0-9]{64}$/u.test(file.sha256) || declared.has(relative) || before.has(relative)) {
      throw new Error(`Snapshot preparation receipt contains an invalid, duplicate or existing artifact: ${relative}`)
    }
    declared.set(relative, file.sha256)
  }
  if (result.metadata !== undefined && (!result.metadata || typeof result.metadata !== 'object' || Array.isArray(result.metadata)
    || Object.values(result.metadata).some(value => typeof value !== 'string'))) {
    throw new TypeError('Snapshot preparation metadata must contain only string values.')
  }
  const after = await sourceInventory(directory)
  for (const [relative, original] of before) {
    const actual = after.get(relative)
    if (!actual || actual.sha256 !== original.sha256 || actual.mode !== original.mode) {
      throw new Error(`Snapshot source preparation changed an existing source file: ${relative}`)
    }
  }
  for (const [relative, actual] of after) {
    if (!before.has(relative) && declared.get(relative) !== actual.sha256) {
      throw new Error(`Snapshot source preparation has an undeclared or mismatched artifact: ${relative}`)
    }
  }
  for (const relative of declared.keys()) {
    if (!after.has(relative)) {
      throw new Error(`Snapshot preparation receipt names a missing artifact: ${relative}`)
    }
  }
  await assertOmittedReferences(directory, report.referenceGitlinks ?? [])
  const receipt: SnapshotPreparationReceipt = {
    commit: report.identity.commit,
    tree: report.sourceTree!,
    files: [...declared].sort(([left], [right]) => left.localeCompare(right)).map(([path, sha256]) => ({ path, sha256 })),
    ...(result.metadata ? { metadata: { ...result.metadata } } : {}),
  }
  report.preparation = receipt
}

/** 构建或打包生命周期不得替换已经核验的外部输入。 */
export async function assertPreparedArtifacts(directory: string, report: SnapshotReport) {
  await assertOmittedReferences(directory, report.referenceGitlinks ?? [])
  if (!report.preparation) {
    return
  }
  const files = await sourceInventory(directory)
  for (const expected of report.preparation.files) {
    if (files.get(expected.path)?.sha256 !== expected.sha256) {
      throw new Error(`Snapshot prepared artifact changed during build or pack: ${expected.path}`)
    }
  }
}
