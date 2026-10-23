import type { DocsOptions } from '@icebreakers/monorepo'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { deployDocs, planDocsDeployment } from '@icebreakers/monorepo'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, commit, fixture, git, makeRecord, put } from './helpers'

afterEach(cleanup)

function runner(inspect?: (source: string) => void) {
  return vi.fn((_command: string, args: string[], input: { cwd: string, env: NodeJS.ProcessEnv }) => {
    if (args[1] === 'docs:build') {
      inspect?.(input.cwd)
    }
    if (args[1] === 'docs:stable') {
      writeFileSync(input.env['REPO_DOCS_RESULT_FILE']!, JSON.stringify({ versionId: 'stable-docs' }))
    }
    return { status: 0, stdout: '', stderr: '' }
  }) as unknown as NonNullable<DocsOptions['spawn']>
}

async function correction(cwd: string) {
  await put(cwd, 'website/index.md', '# Stable\n\nCorrected explanation.\n')
  return commit(cwd, 'docs: correct the stable explanation')
}

describe('stable documentation baseline selection', () => {
  it.each(['before', 'after'] as const)('blocks an unrelated release with a correction committed %s that release', async (timing) => {
    const { cwd, sha, options, record, store } = await fixture()
    await deployDocs({ ...options, spawn: runner() })
    await put(cwd, 'website/future.md', '# Unselected future documentation\n')
    commit(cwd, 'docs: describe future behavior')
    const before = timing === 'before' ? await correction(cwd) : undefined
    await put(cwd, 'packages/other/package.json', JSON.stringify({ name: 'other', version: '1.0.0' }))
    const unrelatedSha = commit(cwd, 'release: publish unrelated package')
    const unrelated = makeRecord(unrelatedSha, {
      packages: [...record.packages, { name: 'other', version: '1.0.0', sourceSha: unrelatedSha }],
      releasedPackages: ['other'],
    })
    await store.github.writeAutomationState(`releases/${unrelated.id}`, unrelated)
    const selected = before ?? await correction(cwd)
    const records = structuredClone(store.records)
    const head = git(cwd, 'rev-parse', 'HEAD')
    const status = git(cwd, 'status', '--porcelain')
    store.writes.length = 0

    const request = { ...options, release: unrelated.id, commits: [selected] }
    const plan = await planDocsDeployment(request)
    expect(plan).toMatchObject({ eligible: false, skipped: false, commits: [] })
    expect(plan.blockers.join('\n')).toContain('current stable baseline')
    const blocked = runner()
    await expect(deployDocs({ ...request, spawn: blocked })).rejects.toMatchObject({ report: { failedStage: 'plan' } })
    expect(blocked).not.toHaveBeenCalled()
    expect(store.writes).toEqual([])
    expect(store.records).toEqual(records)
    expect(git(cwd, 'rev-parse', 'HEAD')).toBe(head)
    expect(git(cwd, 'status', '--porcelain')).toBe(status)

    const { release: _release, ...current } = options
    const corrected = { ...current, commits: [selected] }
    expect(await planDocsDeployment(corrected)).toMatchObject({
      eligible: true,
      skipped: false,
      sourceSha: sha,
      releaseId: record.id,
      commits: [selected],
    })
    let builds = 0
    const result = await deployDocs({
      ...corrected,
      spawn: runner((source) => {
        builds += 1
        expect(readFileSync(path.join(source, 'website/index.md'), 'utf8')).toContain('Corrected explanation.')
        expect(existsSync(path.join(source, 'website/future.md'))).toBe(false)
        expect(existsSync(path.join(source, 'packages/other'))).toBe(false)
      }),
    })
    expect(result).toMatchObject({ status: 'deployed', plan: { sourceSha: sha, releaseId: record.id } })
    expect(builds).toBe(1)
  })

  it('allows a related new release to carry existing corrections and select another correction', async () => {
    const { cwd, options, store } = await fixture()
    await put(cwd, 'website/released.md', '# Newly released documentation\n')
    const nextSha = commit(cwd, 'release: publish documented package')
    const next = makeRecord(nextSha, { releasedPackages: ['core'] })
    await store.github.writeAutomationState(`releases/${next.id}`, next)
    const carried = await correction(cwd)
    await deployDocs({ ...options, commits: [carried], spawn: runner() })
    await put(cwd, 'website/clarification.md', '# Independent clarification\n')
    const selected = commit(cwd, 'docs: clarify published behavior')
    const request = { ...options, release: next.id, commits: [selected] }
    expect(await planDocsDeployment(request)).toMatchObject({
      eligible: true,
      skipped: false,
      sourceSha: nextSha,
      releaseId: next.id,
      commits: [carried, selected],
    })
    let builds = 0
    const result = await deployDocs({
      ...request,
      spawn: runner((source) => {
        builds += 1
        expect(readFileSync(path.join(source, 'website/index.md'), 'utf8')).toContain('Corrected explanation.')
        expect(readFileSync(path.join(source, 'website/released.md'), 'utf8')).toContain('Newly released documentation')
        expect(readFileSync(path.join(source, 'website/clarification.md'), 'utf8')).toContain('Independent clarification')
      }),
    })
    expect(result.status).toBe('deployed')
    expect(builds).toBe(1)
  })
})
