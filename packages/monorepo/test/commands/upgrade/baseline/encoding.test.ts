import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { mergeRootAsset } from '@/commands/upgrade/baseline/merge'
import { fileDiff } from '@/commands/upgrade/plan/diff'

describe('root asset text encoding', () => {
  it('preserves UTF-8 BOM through a three-way merge of disjoint edits', () => {
    const base = Buffer.from('\uFEFFfirst\nsecond\nthird\nfourth\n')
    const local = Buffer.from('\uFEFFfirst\nlocal\nthird\nfourth\n')
    const upstream = Buffer.from('\uFEFFfirst\nsecond\nthird\nupstream\n')
    const result = mergeRootAsset(base, local, upstream)
    expect(result.reason).toBe('three-way-merge')
    expect(result.content).toEqual(Buffer.from('\uFEFFfirst\nlocal\nthird\nupstream\n'))
  })

  it('shows an intentional BOM removal in the reviewed diff', () => {
    expect(fileDiff('config', Buffer.from('\uFEFFvalue\n'), Buffer.from('value\n')).diff).toContain('-\uFEFFvalue')
  })
})
