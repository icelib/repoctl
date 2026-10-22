import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Validate the shipped hashing API on the supported Node runtime.
import { getFileHash, isFileChanged } from '../dist/index.mjs'

describe('hash input compatibility', () => {
  it.each([
    ['ArrayBuffer', ArrayBuffer],
    ['SharedArrayBuffer', SharedArrayBuffer],
  ] as const)('accepts %s and hashes only the selected bytes of its views', (_name, BufferConstructor) => {
    const value = Buffer.from('icebreaker')
    const buffer = new BufferConstructor(value.byteLength)
    new Uint8Array(buffer).set(value)

    expect(getFileHash(buffer)).toBe(getFileHash('icebreaker'))
    expect(isFileChanged(buffer, value)).toBe(false)

    const padded = Buffer.from('--icebreaker--')
    const backing = new BufferConstructor(padded.byteLength)
    new Uint8Array(backing).set(padded)
    const views = [
      new Uint8Array(backing, 2, value.byteLength),
      new DataView(backing, 2, value.byteLength),
      Buffer.from(backing, 2, value.byteLength),
    ]

    for (const view of views) {
      expect(getFileHash(view)).toBe(getFileHash('icebreaker'))
      expect(isFileChanged(view, value)).toBe(false)
    }

    new Uint8Array(buffer)[0] = 0
    expect(isFileChanged(buffer, value)).toBe(true)
  })
})
