import type { Buffer } from 'node:buffer'
import type { SpawnSyncReturns } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { verifyCommitMsg, verifyPreCommit, verifyPrePush, verifyStagedTypecheck } from '@/commands'

function createSpawnResult(status = 0) {
  return { status } as SpawnSyncReturns<Buffer>
}

const repoRoot = path.resolve(__dirname, '../../../..')

describe('verify commands', () => {
  it('runs pre-push tasks for changed workspace and root files', async () => {
    const execFileMock = vi.fn((command: string, args: string[]) => {
      expect(command).toBe('git')
      if (args[0] === 'diff') {
        return 'packages/monorepo/src/index.ts\0package.json\0'
      }
      throw new Error(`unexpected git args: ${args.join(' ')}`)
    })
    const spawnMock = vi.fn(() => createSpawnResult())

    await verifyPrePush({
      cwd: repoRoot,
      stdinText: 'refs/heads/main local-sha refs/remotes/origin/main remote-sha',
      execFile: execFileMock as unknown as typeof import('node:child_process').execFileSync,
      spawn: spawnMock as unknown as typeof import('node:child_process').spawnSync,
    })

    expect(spawnMock.mock.calls).toEqual([
      ['pnpm', ['--dir', 'packages/monorepo', 'build'], expect.objectContaining({ cwd: repoRoot, stdio: 'inherit' })],
      ['pnpm', ['--dir', 'packages/monorepo', 'test'], expect.objectContaining({ cwd: repoRoot, stdio: 'inherit' })],
      ['pnpm', ['--dir', 'packages/monorepo', 'tsd'], expect.objectContaining({ cwd: repoRoot, stdio: 'inherit' })],
      ['pnpm', ['lint'], expect.objectContaining({ cwd: repoRoot, stdio: 'inherit' })],
      ['pnpm', ['typecheck'], expect.objectContaining({ cwd: repoRoot, stdio: 'inherit' })],
      ['pnpm', ['build'], expect.objectContaining({ cwd: repoRoot, stdio: 'inherit' })],
      ['pnpm', ['test'], expect.objectContaining({ cwd: repoRoot, stdio: 'inherit' })],
      ['pnpm', ['tsd'], expect.objectContaining({ cwd: repoRoot, stdio: 'inherit' })],
    ])
  })

  it('runs root lint and typecheck on pre-push even when only workspace files changed', async () => {
    const execFileMock = vi.fn((command: string, args: string[]) => {
      expect(command).toBe('git')
      if (args[0] === 'diff') {
        return 'packages/monorepo/src/index.ts\0'
      }
      throw new Error(`unexpected git args: ${args.join(' ')}`)
    })
    const spawnMock = vi.fn(() => createSpawnResult())

    await verifyPrePush({
      cwd: repoRoot,
      stdinText: 'refs/heads/main local-sha refs/remotes/origin/main remote-sha',
      execFile: execFileMock as unknown as typeof import('node:child_process').execFileSync,
      spawn: spawnMock as unknown as typeof import('node:child_process').spawnSync,
    })

    expect(spawnMock.mock.calls).toContainEqual(
      ['pnpm', ['lint'], expect.objectContaining({ cwd: repoRoot, stdio: 'inherit' })],
    )
    expect(spawnMock.mock.calls).toContainEqual(
      ['pnpm', ['typecheck'], expect.objectContaining({ cwd: repoRoot, stdio: 'inherit' })],
    )
  })

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
