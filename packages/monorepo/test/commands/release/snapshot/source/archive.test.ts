import type { SnapshotArchiveEntry } from '../../../../../src/commands/release/snapshot/archive'
import type { SnapshotReport } from '../../../../../src/commands/release/snapshot/types'
import { Buffer } from 'node:buffer'
import path from 'node:path'
import { expect, it } from 'vitest'
import { assertPreparedArchive } from '../../../../../src/commands/release/snapshot/source/archive'
import { sha256 } from './fixture'

function entry(name: string, value: string, type: SnapshotArchiveEntry['type'] = 'File'): SnapshotArchiveEntry {
  return { path: name, type, mode: 0o644, data: Buffer.from(value) }
}

function report(files: string[]): Pick<SnapshotReport, 'source' | 'preparation'> {
  return {
    source: path.resolve('fixture'),
    preparation: { commit: 'a'.repeat(40), tree: 'b'.repeat(40), files: files.map(path => ({ path, sha256: sha256('verified') })) },
  }
}

it.each([
  ['.', 'binding.node'],
  [path.join('packages', 'native'), 'packages/native/binding.node'],
])('按文件系统目录映射根包和嵌套包回执：%s', (directory, receipt) => {
  const pkg = { name: 'native', directory }
  expect(() => assertPreparedArchive([entry('package/binding.node', 'verified')], pkg, report([receipt]))).not.toThrow()
  expect(() => assertPreparedArchive([entry('package/binding.node', 'changed')], pkg, report([receipt]))).toThrow('in tarball')
})

it('同级包及未发布的构建输入不会被误认为当前包的归档文件', () => {
  const pkg = { name: 'native', directory: path.join('packages', 'a') }
  const snapshot = report(['packages/ab/binding.node', 'packages/a/build-input.node', 'outside.node'])
  expect(() => assertPreparedArchive([entry('package/binding.node', 'unrelated')], pkg, snapshot)).not.toThrow()
})

it('目录不能替代回执声明的产物文件', () => {
  const pkg = { name: 'native', directory: '.' }
  expect(() => assertPreparedArchive([entry('package/binding.node/', '', 'Directory')], pkg, report(['binding.node']))).toThrow('in tarball')
})
