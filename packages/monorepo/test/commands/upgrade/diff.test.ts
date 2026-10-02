import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { createUpgradeDiff } from '@/commands/upgrade/diff'

describe('upgrade content previews', () => {
  it('reports text changes and preserves the original byte hashes', () => {
    const before = Buffer.from('same\r\nold\r\n', 'utf8')
    const after = Buffer.from('same\nnew\n', 'utf8')
    const diff = createUpgradeDiff('config.yml', before, after, true)

    expect(diff.kind).toBe('text')
    expect(diff.beforeBytes).toBe(before.byteLength)
    expect(diff.afterBytes).toBe(after.byteLength)
    expect(diff.beforeHash).toBe('2a63d654f6b280e09baa09a7c3f02d9e637a1c4ebed5deb243b30c2e67088842')
    expect(diff.afterHash).toBe('6630e0e714161f2f5c60f93bb4b946c40ba6d8506ddce90be49b97b45a3b3054')
    expect(diff.addedLines).toBe(1)
    expect(diff.deletedLines).toBe(1)
    expect(diff.text).toContain('--- a/config.yml')
    expect(diff.text).toContain('-old')
    expect(diff.text).toContain('+new')
  })

  it('summarizes binary files without emitting their contents', () => {
    const diff = createUpgradeDiff('asset.bin', Buffer.from([0, 1, 2]), Buffer.from([0, 3]), true)

    expect(diff).toEqual({
      kind: 'binary',
      beforeBytes: 3,
      afterBytes: 2,
      beforeHash: 'ae4b3280e56e2faf83f414a6e3dabe9d5fbe18976544c05fed121accb85b53fc',
      afterHash: '583c7dfb7b3055d99465544032a571e10a134b1b6f769422bbb71fd7fa167a5d',
      addedLines: 0,
      deletedLines: 0,
      truncated: false,
    })
  })

  it('caps explicitly requested text output', () => {
    const before = Buffer.from(`${'x\n'.repeat(10000)}`)
    const after = Buffer.from(`${'y\n'.repeat(10000)}`)
    const diff = createUpgradeDiff('large.txt', before, after, true)

    expect(diff.truncated).toBe(true)
    expect(Buffer.byteLength(diff.text ?? '')).toBeLessThanOrEqual(16 * 1024)
  })
})
