import { afterEach, describe, expect, it, vi } from 'vitest'

const verifyCommitMsgMock = vi.fn(async () => {})
const verifyPreCommitMock = vi.fn(async () => {})
const verifyStagedTypecheckMock = vi.fn(() => {})

vi.mock('@/commands/verify', () => ({
  verifyCommitMsg: verifyCommitMsgMock,
  verifyPreCommit: verifyPreCommitMock,
  verifyStagedTypecheck: verifyStagedTypecheckMock,
}))

afterEach(() => {
  verifyCommitMsgMock.mockClear()
  verifyPreCommitMock.mockClear()
  verifyStagedTypecheckMock.mockClear()
})

describe('runRecommendedCheck', () => {
  it('resolves a dry-run plan for the default check route', async () => {
    const { resolveRecommendedCheckPlan } = await import('@/commands/check')
    const plan = resolveRecommendedCheckPlan({ cwd: '/repo' })

    expect(plan).toEqual({
      cwd: '/repo',
      mode: 'default',
      commands: [
        expect.objectContaining({
          name: 'pre-commit',
          command: 'repo verify pre-commit',
        }),
      ],
    })
  })

  it('resolves a dry-run plan for staged checks', async () => {
    const { resolveRecommendedCheckPlan } = await import('@/commands/check')
    const plan = resolveRecommendedCheckPlan({ cwd: '/repo', staged: true })

    expect(plan.mode).toBe('staged')
    expect(plan.commands.map(command => command.name)).toEqual(['pre-commit'])
  })

  it('keeps dry-run repo commands mapped to existing verify subcommands', async () => {
    const { getKnownRepoCheckCommands, resolveRecommendedCheckPlan } = await import('@/commands/check')
    const knownCommands = getKnownRepoCheckCommands()
    const plans = [
      resolveRecommendedCheckPlan({ cwd: '/repo' }),
      resolveRecommendedCheckPlan({ cwd: '/repo', staged: true }),
      resolveRecommendedCheckPlan({ cwd: '/repo', full: true }),
      resolveRecommendedCheckPlan({ cwd: '/repo', editFile: '.git/COMMIT_EDITMSG' }),
    ]

    for (const command of plans.flatMap(plan => plan.commands)) {
      const normalizedCommand = command.command
        .replace(/\s+<staged files>$/, '')
        .replace(/\s+\.git\/COMMIT_EDITMSG$/, '')
      expect(knownCommands.has(normalizedCommand)).toBe(true)
    }
  })

  it('resolves editFile before other check modes', async () => {
    const { resolveRecommendedCheckPlan } = await import('@/commands/check')
    const plan = resolveRecommendedCheckPlan({
      cwd: '/repo',
      full: true,
      staged: true,
      editFile: '.git/COMMIT_EDITMSG',
    })

    expect(plan).toEqual(expect.objectContaining({
      mode: 'commit-msg',
      commands: [
        expect.objectContaining({
          command: 'repo verify commit-msg .git/COMMIT_EDITMSG',
        }),
      ],
    }))
  })

  it('routes editFile to commit-msg verification', async () => {
    const { runRecommendedCheck } = await import('@/commands/check')
    await runRecommendedCheck({ cwd: '/repo', editFile: '.git/COMMIT_EDITMSG' })

    expect(verifyCommitMsgMock).toHaveBeenCalledWith({
      cwd: '/repo',
      editFile: '.git/COMMIT_EDITMSG',
    })
  })

  it('resolves full dry-run commands from existing root scripts only', async () => {
    const pathExistsMock = vi.fn(async () => true)
    const readJsonMock = vi.fn(async () => ({
      scripts: {
        lint: 'eslint .',
        typecheck: 'tsc -p tsconfig.json',
      },
    }))

    await vi.resetModules()
    vi.doMock('@/utils/fs', async () => {
      const actual = await vi.importActual<typeof import('@/utils/fs')>('@/utils/fs')
      return {
        ...actual,
        default: {
          ...actual.default,
          pathExists: pathExistsMock,
          readJson: readJsonMock,
        },
      }
    })

    const { resolveFullWorkspaceCheckPlan } = await import('@/commands/check')
    const plan = await resolveFullWorkspaceCheckPlan('/repo')

    expect(plan.commands.map(command => command.command)).toEqual(['pnpm lint', 'pnpm typecheck'])
    expect(plan.commands.every(command => command.available)).toBe(true)
  })

  it('runs full checks from existing root scripts only', async () => {
    const pathExistsMock = vi.fn(async () => true)
    const readJsonMock = vi.fn(async () => ({
      scripts: {
        lint: 'eslint .',
        typecheck: 'tsc -p tsconfig.json',
      },
    }))
    const spawnMock = vi.fn(() => ({ status: 0 }))

    await vi.resetModules()
    vi.doMock('@/utils/fs', async () => {
      const actual = await vi.importActual<typeof import('@/utils/fs')>('@/utils/fs')
      return {
        ...actual,
        default: {
          ...actual.default,
          pathExists: pathExistsMock,
          readJson: readJsonMock,
        },
      }
    })

    const { runRecommendedCheck } = await import('@/commands/check')
    await runRecommendedCheck({ cwd: '/repo', full: true, spawn: spawnMock as never })

    expect(spawnMock).toHaveBeenCalledTimes(2)
    expect(spawnMock).toHaveBeenNthCalledWith(1, 'pnpm', ['lint'], expect.objectContaining({ cwd: '/repo' }))
    expect(spawnMock).toHaveBeenNthCalledWith(2, 'pnpm', ['typecheck'], expect.objectContaining({ cwd: '/repo' }))
  })

  it('runs the native pre-commit pipeline without a duplicate typecheck', async () => {
    const { runRecommendedCheck } = await import('@/commands/check')
    await runRecommendedCheck({ cwd: '/repo', staged: true })

    expect(verifyPreCommitMock).toHaveBeenCalledWith({ cwd: '/repo' })
    expect(verifyStagedTypecheckMock).not.toHaveBeenCalled()
  })

  it('defaults to pre-commit verification', async () => {
    const { runRecommendedCheck } = await import('@/commands/check')
    await runRecommendedCheck({ cwd: '/repo' })

    expect(verifyPreCommitMock).toHaveBeenCalledWith({ cwd: '/repo' })
  })
})
