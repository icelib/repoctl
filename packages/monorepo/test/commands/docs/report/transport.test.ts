import type { spawnSync } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { runDocsProcess } from '@/commands/docs/execute'

describe('documentation process report transport', () => {
  it.each([true, false])('streams stdout live to %s-selected destination without buffering', (json) => {
    const spawn = vi.fn<typeof spawnSync>().mockReturnValue({ pid: 1, output: [], stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), status: 0, signal: null })
    const env = { REPO_DOCS_CHANNEL: 'preview' }
    runDocsProcess({ cwd: '/workspace', site: 'guide', channel: 'preview', json, spawn: spawn as unknown as typeof spawnSync }, '/frozen-source', ['run', 'docs:build'], env)
    expect(spawn).toHaveBeenCalledExactlyOnceWith('pnpm', ['run', 'docs:build'], {
      cwd: '/frozen-source',
      env,
      stdio: json ? ['inherit', 2, 2] : 'inherit',
    })
  })
})
