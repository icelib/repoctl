import { Buffer } from 'node:buffer'
import { expect, it } from 'vitest'
import { readSnapshotZip } from '../../../../../../src/commands/release/snapshot/prepared/github/archive'
import { readBounded } from '../../../../../../src/commands/release/snapshot/prepared/github/client'
import { zip } from './fixture'

it('rejects archive traversal and unsafe paths before exposing candidate bytes', async () => {
  for (const name of ['../escape', '/absolute', 'directory/../../escape', 'C:/outside', 'directory\\escape', 'a\u0000b']) {
    await expect(readSnapshotZip(zip([[name, Buffer.from('payload')]]))).rejects.toThrow()
  }
})

it('rejects duplicate ZIP entries, links and conflicting file parents', async () => {
  await expect(readSnapshotZip(zip([['same', Buffer.from('a')], ['same', Buffer.from('b')]]))).rejects.toThrow('duplicate')
  await expect(readSnapshotZip(zip([['link', Buffer.from('target')]], new Map([['link', 0o120777]])))).rejects.toThrow('linked')
  await expect(readSnapshotZip(zip([['a', Buffer.from('file')], ['a/b', Buffer.from('nested')]]))).rejects.toThrow('conflicting')
})

it('rejects declared decompression bombs without allocating their expanded contents', async () => {
  const bytes = zip([['package.tgz', Buffer.from('small')]])
  const central = bytes.indexOf(Buffer.from([0x50, 0x4B, 0x01, 0x02]))
  bytes.writeUInt16LE(8, central + 10)
  bytes.writeUInt32LE(1024 * 1024 * 1024, central + 24)
  await expect(readSnapshotZip(bytes)).rejects.toThrow('oversized')
})

it('rejects encrypted ZIP entries including strong-encryption flags', async () => {
  for (const flag of [1, 0x40]) {
    const bytes = zip([['package.tgz', Buffer.from('small')]])
    const central = bytes.indexOf(Buffer.from([0x50, 0x4B, 0x01, 0x02]))
    bytes.writeUInt16LE(flag, central + 8)
    await expect(readSnapshotZip(bytes)).rejects.toThrow()
  }
})

it('bounds downloads even when no content length is supplied', async () => {
  await expect(readBounded(new Response('oversized'), 3)).rejects.toThrow('permitted size')
  await expect(readBounded(new Response('x', { headers: { 'content-length': '1000' } }), 3)).rejects.toThrow('permitted size')
})
