import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { planPushCommits } from '@/commands/verify/pre-push/refs'
import { cleanupRepositories, createRepository, hookLine, recordGitCalls } from './fixtures'

afterEach(() => {
  vi.unstubAllEnvs()
  cleanupRepositories()
})

describe('pre-push planning ignores local replacement objects', () => {
  it.each(['local', 'remote'] as const)('keeps the broken package selected when the %s commit is replaced', (side) => {
    const fixture = createRepository()
    const changedPath = 'packages/b/state.txt'
    fixture.write('packages/a/state.txt', 'healthy a\n')
    fixture.write(changedPath, 'healthy b\n')
    const base = fixture.commit()
    fixture.write(changedPath, 'BROKEN b\n')
    const broken = fixture.commit()
    fixture.git('replace', side === 'local' ? broken : base, side === 'local' ? base : broken)
    // The local replacement hides this difference from an ordinary Git diff.
    expect(fixture.git('diff', '--name-only', base, broken)).toBe('')
    expect(fixture.git('--no-replace-objects', 'show', `${broken}:${changedPath}`)).toBe('BROKEN b')
    const recorder = recordGitCalls()

    expect(planPushCommits(hookLine(broken, base), fixture.root, recorder.execFile)).toEqual([
      { commit: broken, refs: ['refs/heads/main'], changedFiles: [changedPath] },
    ])

    expect(fixture.git('replace', '-l')).toBe(side === 'local' ? broken : base)
    expect(recorder.environments.every(environment => environment?.['GIT_NO_REPLACE_OBJECTS'] === '1')).toBe(true)
  })

  it('preserves hook environment variables while disabling replacements for every planning command', () => {
    const fixture = createRepository()
    fixture.write('packages/a/state.txt', 'healthy\n')
    const head = fixture.commit()
    const index = path.join(fixture.root, '.git', 'index')
    vi.stubEnv('GIT_INDEX_FILE', index)
    vi.stubEnv('REPOCTL_PUSH_HOOK_FLAG', 'retained')
    vi.stubEnv('GIT_NO_REPLACE_OBJECTS', '0')
    const recorder = recordGitCalls()

    expect(planPushCommits(hookLine(head), fixture.root, recorder.execFile)[0]?.changedFiles).toEqual(['packages/a/state.txt'])

    expect(recorder.calls.map(args => args[0])).toEqual(['rev-parse', 'hash-object', 'diff'])
    for (const environment of recorder.environments) {
      expect(environment).toMatchObject({
        GIT_INDEX_FILE: index,
        GIT_NO_REPLACE_OBJECTS: '1',
        REPOCTL_PUSH_HOOK_FLAG: 'retained',
      })
    }
  })
})
