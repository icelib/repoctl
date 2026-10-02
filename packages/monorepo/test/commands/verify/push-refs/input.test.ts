import type { execFileSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { planPushCommits } from '@/commands/verify/pre-push/refs'
import { hookLine } from './fixtures'

const sha = 'a'.repeat(40)
const zero = '0'.repeat(40)

describe('pre-push hook input validation', () => {
  it.each(['', '\n\r\n', ' \t\n'])('returns no commits for empty input %j without invoking Git', (input) => {
    const exec = vi.fn()
    expect(planPushCommits(input, '/unused', exec as typeof execFileSync)).toEqual([])
    expect(exec).not.toHaveBeenCalled()
  })

  it.each([
    `refs/heads/main ${sha} refs/heads/main`,
    `${hookLine(sha)} extra`,
    hookLine('a'.repeat(39)),
    hookLine('a'.repeat(41)),
    hookLine('a'.repeat(63)),
    hookLine('a'.repeat(65)),
    hookLine('g'.repeat(40)),
    hookLine(sha, 'g'.repeat(40)),
    hookLine(zero, 'invalid'),
    hookLine(sha, zero, 'refs/heads/main\u0000'),
  ])('rejects malformed input before invoking Git: %j', (input) => {
    const exec = vi.fn()
    expect(() => planPushCommits(input, '/unused', exec as typeof execFileSync)).toThrow('Invalid pre-push input')
    expect(exec).not.toHaveBeenCalled()
  })

  it('validates later input records before resolving any objects', () => {
    const exec = vi.fn()
    expect(() => planPushCommits(`${hookLine(sha)}\ninvalid\n`, '/unused', exec as typeof execFileSync)).toThrow('line 2')
    expect(exec).not.toHaveBeenCalled()
  })

  it.each([40, 64])('ignores deleted refs with %i-character object IDs', (length) => {
    const exec = vi.fn()
    const input = hookLine('0'.repeat(length), 'a'.repeat(length), 'refs/heads/deleted', '(delete)')
    expect(planPushCommits(input, '/unused', exec as typeof execFileSync)).toEqual([])
    expect(exec).not.toHaveBeenCalled()
  })

  it('preserves Unicode whitespace in ref names and accepts CRLF records', () => {
    const ref = 'refs/heads/中文\u3000分支'
    const exec = vi.fn(() => `${sha}\n`)
    const input = `${hookLine(sha.toUpperCase(), sha, ref, 'HEAD')}\r\n`
    expect(planPushCommits(input, '/unused', exec as unknown as typeof execFileSync)).toEqual([
      { commit: sha, refs: [ref], changedFiles: [] },
    ])
    expect(exec).toHaveBeenCalledTimes(1)
    expect(exec).toHaveBeenCalledWith('git', ['rev-parse', '--verify', '--end-of-options', `${sha}^{commit}`], expect.objectContaining({ cwd: '/unused' }))
  })
})
