import type { SnapshotArchiveEntry } from '../archive'
import type { SnapshotPackage, SnapshotReport } from '../types'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { sourcePath } from './paths'

/** 最终归档中出现的外部输入必须保留回执字节，防止 pack 生命周期临时替换后还原。 */
export function assertPreparedArchive(entries: SnapshotArchiveEntry[], pkg: Pick<SnapshotPackage, 'name' | 'directory'>, report: Pick<SnapshotReport, 'source' | 'preparation'>) {
  if (!report.preparation) {
    return
  }
  const packed = new Map(entries.map(entry => [entry.path.replace(/\/$/u, ''), entry]))
  const root = path.resolve(report.source, pkg.directory)
  for (const expected of report.preparation.files) {
    const relative = path.relative(root, sourcePath(report.source, expected.path))
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      continue
    }
    const archivePath = ['package', ...relative.split(path.sep)].join('/')
    const entry = packed.get(archivePath)
    if (entry && (entry.type !== 'File' || createHash('sha256').update(entry.data).digest('hex') !== expected.sha256)) {
      throw new Error(`Snapshot prepared artifact changed during build or pack: ${expected.path} in tarball ${pkg.name}.`)
    }
  }
}
