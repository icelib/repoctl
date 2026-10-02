import type { Buffer } from 'node:buffer'
import type { SpawnSyncReturns } from 'node:child_process'
import path from 'node:path'
import { verifyCommitMsg, verifyPreCommit, verifyStagedTypecheck } from '@icebreakers/monorepo'
import { describe, expect, it, vi } from 'vitest'

function createSpawnResult(status = 0) {
  return { status } as SpawnSyncReturns<Buffer>
}

const repoRoot = path.resolve(__dirname, '../../../..')

describe('verify commands', () => {
  it('uses the root typecheck when root and child workspaces are both staged', () => {
    const spawnMock = vi.fn(() => createSpawnResult())

    verifyStagedTypecheck([
      'packages/monorepo/src/index.ts',
      'packages/monorepo/test/program.test.ts',
      'templates/client/package.json',
      'README.md',
      'vitest.config.ts',
    ], {
      cwd: repoRoot,
      spawn: spawnMock as unknown as typeof import('node:child_process').spawnSync,
    })

    expect(spawnMock.mock.calls).toEqual([
      ['pnpm', ['--dir', repoRoot, 'typecheck'], expect.objectContaining({ cwd: repoRoot, stdio: 'inherit' })],
    ])
  })

  it('routes package.json files to the owning workspace typecheck', () => {
    const spawnMock = vi.fn(() => createSpawnResult())

    verifyStagedTypecheck([
      'templates/client/package.json',
    ], {
      cwd: repoRoot,
      spawn: spawnMock as unknown as typeof import('node:child_process').spawnSync,
    })

    expect(spawnMock.mock.calls).toEqual([
      ['pnpm', ['--dir', path.join(repoRoot, 'templates/client'), 'typecheck'], expect.objectContaining({ cwd: repoRoot, stdio: 'inherit' })],
    ])
  })

  it('resolves asset template files back to the owning workspace', () => {
    const spawnMock = vi.fn(() => createSpawnResult())
    const assetsDir = path.join(repoRoot, 'packages/monorepo/assets')

    verifyStagedTypecheck([
      'commitlint.config.ts',
      'vitest.config.ts',
    ], {
      cwd: assetsDir,
      spawn: spawnMock as unknown as typeof import('node:child_process').spawnSync,
    })

    expect(spawnMock.mock.calls).toEqual([
      ['pnpm', ['--dir', path.join(repoRoot, 'packages/monorepo'), 'typecheck'], expect.objectContaining({ cwd: assetsDir, stdio: 'inherit' })],
    ])
  })

  it('runs commitlint for commit message verification', async () => {
    const spawnMock = vi.fn(() => createSpawnResult())

    await verifyCommitMsg({
      cwd: repoRoot,
      editFile: '.git/COMMIT_EDITMSG',
      spawn: spawnMock as unknown as typeof import('node:child_process').spawnSync,
    })

    expect(spawnMock.mock.calls).toEqual([
      ['pnpm', ['exec', 'commitlint', '--edit', '.git/COMMIT_EDITMSG'], expect.objectContaining({ cwd: repoRoot, stdio: 'inherit' })],
    ])
  })

  it('runs lint-staged for pre-commit verification', async () => {
    const spawnMock = vi.fn(() => createSpawnResult())

    await verifyPreCommit({
      cwd: repoRoot,
      spawn: spawnMock as unknown as typeof import('node:child_process').spawnSync,
    })

    expect(spawnMock.mock.calls).toEqual([
      ['pnpm', ['exec', 'lint-staged'], expect.objectContaining({ cwd: repoRoot, stdio: 'inherit' })],
    ])
  })
})
