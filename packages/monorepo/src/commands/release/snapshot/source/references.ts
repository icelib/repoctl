import type { SnapshotOptions, SnapshotReferenceGitlink, SnapshotReport } from '../types'
import { lstat, readdir } from 'node:fs/promises'
import path from 'node:path'
import { snapshotCommand } from '../process'
import { sourcePath, sourceRelativePath } from './paths'

export function snapshotSourceEvidence(options: SnapshotOptions) {
  const allowed = options.referenceGitlinks ?? []
  if (!Array.isArray(allowed)) {
    throw new TypeError('Snapshot referenceGitlinks must be an explicit array of Git tree paths.')
  }
  const expected = new Set(allowed.map(sourceRelativePath))
  if (expected.size !== allowed.length) {
    throw new Error('Snapshot referenceGitlinks contains duplicate paths.')
  }
  const tree = snapshotCommand('git', ['rev-parse', `${options.identity.commit}^{tree}`], options)
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(tree)) {
    throw new Error('Snapshot source tree identity is invalid.')
  }
  const entries = snapshotCommand('git', ['ls-tree', '-rz', '--full-tree', options.identity.commit], options)
  const referenceGitlinks: SnapshotReferenceGitlink[] = []
  for (const entry of entries.split('\0').filter(Boolean)) {
    const match = /^(\d{6}) (\w+) ([a-f0-9]{40}|[a-f0-9]{64})\t([\s\S]+)$/u.exec(entry)
    if (!match) {
      throw new Error('Snapshot source tree contains an invalid Git entry.')
    }
    if (match[1] !== '160000') {
      continue
    }
    const relative = sourceRelativePath(match[4])
    if (match[2] !== 'commit' || !expected.delete(relative)) {
      throw new Error(`Snapshot source archives do not support Git submodules unless explicitly listed in referenceGitlinks: ${relative}`)
    }
    referenceGitlinks.push({ path: relative, commit: match[3]! })
  }
  if (expected.size) {
    throw new Error(`Snapshot referenceGitlinks must name actual Git gitlinks: ${[...expected].join(', ')}`)
  }
  return { tree, referenceGitlinks }
}

export function assertReferenceDependencies(source: string, paths: string[], references: readonly SnapshotReferenceGitlink[]) {
  for (const reference of references) {
    const root = sourcePath(source, reference.path)
    if (paths.some((target) => {
      const relative = path.relative(root, path.resolve(target))
      return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
    })) {
      throw new Error(`Snapshot workspace packages and local dependencies cannot use omitted reference gitlink: ${reference.path}`)
    }
  }
}

export async function assertOmittedReferences(source: string, references: readonly SnapshotReferenceGitlink[]) {
  for (const reference of references) {
    const target = sourcePath(source, reference.path)
    try {
      const stat = await lstat(target)
      if (!stat.isDirectory() || (await readdir(target)).length) {
        throw new Error(`Snapshot reference gitlink must remain an empty omitted directory: ${reference.path}`)
      }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }
}

export function assertSnapshotEvidence(report: SnapshotReport, options: SnapshotOptions) {
  const evidence = snapshotSourceEvidence({ ...options, cwd: report.source })
  if ((report.sourceTree !== undefined && report.sourceTree !== evidence.tree)
    || (report.referenceGitlinks !== undefined && JSON.stringify(report.referenceGitlinks) !== JSON.stringify(evidence.referenceGitlinks))) {
    throw new Error('Snapshot source tree or reference gitlinks changed after planning.')
  }
  report.sourceTree = evidence.tree
  report.referenceGitlinks = evidence.referenceGitlinks
  return evidence
}
