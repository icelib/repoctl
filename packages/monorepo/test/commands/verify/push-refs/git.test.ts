import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { planPushCommits } from '@/commands/verify/pre-push/refs'
import { cleanupRepositories, createRepository, hookLine, recordGitCalls } from './fixtures'

afterEach(cleanupRepositories)

describe('pre-push commit planning with real Git objects', () => {
  it('peels annotated local and remote tags and deduplicates shared commit comparisons', () => {
    const fixture = createRepository()
    fixture.write('packages/a/value.txt', 'base\n')
    const base = fixture.commit()
    fixture.git('tag', '-a', 'before', '-m', 'before')
    const remoteTag = fixture.git('rev-parse', 'refs/tags/before')
    fixture.write('packages/a/value.txt', 'updated\n')
    const head = fixture.commit()
    fixture.git('tag', '-a', 'after', '-m', 'after')
    fixture.git('tag', 'lightweight')
    const localTag = fixture.git('rev-parse', 'refs/tags/after')
    const recorder = recordGitCalls()
    const input = [
      hookLine(head, base),
      hookLine(localTag, remoteTag, 'refs/tags/after'),
      hookLine(fixture.git('rev-parse', 'refs/tags/lightweight'), base, 'refs/tags/lightweight'),
      hookLine(localTag, remoteTag, 'refs/tags/after'),
    ].join('\n')

    expect(planPushCommits(input, fixture.root, recorder.execFile)).toEqual([
      { commit: head, refs: ['refs/heads/main', 'refs/tags/after', 'refs/tags/lightweight'], changedFiles: ['packages/a/value.txt'] },
    ])
    expect(recorder.calls.filter(args => args[0] === 'diff')).toHaveLength(1)
    expect(recorder.calls.filter(args => args[0] === 'rev-parse')).toHaveLength(4)
  })

  it('unions different remote bases within a commit and retains different target commits', () => {
    const fixture = createRepository()
    fixture.write('packages/a/value.txt', 'a base\n')
    fixture.write('packages/b/value.txt', 'b base\n')
    const base = fixture.commit()
    fixture.write('packages/a/value.txt', 'a next\n')
    const middle = fixture.commit()
    fixture.write('packages/b/value.txt', 'b next\n')
    const head = fixture.commit()
    const recorder = recordGitCalls()
    const input = [
      hookLine(head, middle, 'refs/heads/recent'),
      hookLine(head, base, 'refs/heads/older'),
      hookLine(middle, base, 'refs/heads/middle'),
      hookLine(head, middle, 'refs/heads/recent'),
    ].join('\n')

    expect(planPushCommits(input, fixture.root, recorder.execFile)).toEqual([
      { commit: head, refs: ['refs/heads/recent', 'refs/heads/older'], changedFiles: ['packages/b/value.txt', 'packages/a/value.txt'] },
      { commit: middle, refs: ['refs/heads/middle'], changedFiles: ['packages/a/value.txt'] },
    ])
    expect(recorder.calls.filter(args => args[0] === 'diff')).toHaveLength(3)
  })

  it.each(['sha1', 'sha256'] as const)('uses the repository empty tree for new remote refs in %s repositories', (format) => {
    const fixture = createRepository(format)
    fixture.write('nested/workspace/packages/a/value.txt', 'new file\n')
    const head = fixture.commit()
    const recorder = recordGitCalls()
    const input = `${hookLine(head)}\n${hookLine(head, undefined, 'refs/tags/new')}\n${hookLine('0'.repeat(head.length), head, 'refs/heads/deleted', '(delete)')}`

    expect(planPushCommits(input, fixture.root, recorder.execFile)).toEqual([
      { commit: head, refs: ['refs/heads/main', 'refs/tags/new'], changedFiles: ['nested/workspace/packages/a/value.txt'] },
    ])
    expect(recorder.calls.filter(args => args[0] === 'hash-object')).toHaveLength(1)
    expect(recorder.calls.filter(args => args[0] === 'diff')).toHaveLength(1)
  })

  it('keeps root-relative deleted paths and both sides of a cross-package rename', () => {
    const fixture = createRepository()
    const oldPath = 'nested/workspace/packages/source/old 中文.ts'
    const newPath = 'nested/workspace/packages/target/renamed space.ts'
    const deletedPath = 'nested/workspace/packages/deleted/remove.ts'
    fixture.write(oldPath, 'unique source to preserve rename detection\n')
    fixture.write(deletedPath, 'different deleted content\n')
    const base = fixture.commit()
    mkdirSync(path.dirname(path.join(fixture.root, newPath)), { recursive: true })
    fixture.git('mv', oldPath, newPath)
    rmSync(path.join(fixture.root, deletedPath))
    const head = fixture.commit()

    const plan = planPushCommits(hookLine(head, base), fixture.root, execFileSync)

    expect(plan).toHaveLength(1)
    expect(plan[0]?.changedFiles.toSorted()).toEqual([oldPath, newPath, deletedPath].toSorted())
  })

  it.each(['local', 'remote'] as const)('rejects a non-commit %s object instead of using the current checkout', (side) => {
    const fixture = createRepository()
    fixture.write('value.txt', 'content\n')
    const head = fixture.commit()
    const tree = fixture.git('rev-parse', 'HEAD^{tree}')
    const recorder = recordGitCalls()
    const input = side === 'local' ? hookLine(tree, head) : hookLine(head, tree)

    expect(() => planPushCommits(input, fixture.root, recorder.execFile)).toThrow('does not resolve to a commit')
    expect(recorder.calls.filter(args => args[0] === 'diff')).toHaveLength(0)
  })

  it('rejects a missing remote base instead of replacing it with an unrelated ancestor', () => {
    const fixture = createRepository()
    fixture.write('value.txt', 'content\n')
    const head = fixture.commit()
    const recorder = recordGitCalls()

    expect(() => planPushCommits(hookLine(head, 'f'.repeat(head.length)), fixture.root, recorder.execFile)).toThrow('remote base of refs/heads/main')
    expect(recorder.calls.filter(args => args[0] === 'diff')).toHaveLength(0)
  })
})
