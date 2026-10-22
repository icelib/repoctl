import type { DocsOptions } from '@icebreakers/monorepo'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { deployDocs, planDocsDeployment } from '@icebreakers/monorepo'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, commit, fixture, makeRecord, put } from './helpers'

afterEach(cleanup)

const spawn = ((_command: string, args: string[], options: { cwd: string, env: NodeJS.ProcessEnv }) => {
  if (args[1] === 'docs:stable') {
    expect(readFileSync(path.join(options.cwd, 'website/index.md'), 'utf8')).toContain('Corrected explanation.')
    expect(readFileSync(path.join(options.cwd, 'packages/core/src/index.ts'), 'utf8')).not.toContain('unreleased')
    writeFileSync(options.env['REPO_DOCS_RESULT_FILE']!, JSON.stringify({ versionId: 'corrected-docs' }))
  }
  return { status: 0, stdout: '', stderr: '' }
}) as unknown as NonNullable<DocsOptions['spawn']>

describe('selected stable documentation corrections', () => {
  it('applies only selected patches and carries them until a later release includes them', async () => {
    const { options, cwd, store, sha } = await fixture()
    await put(cwd, 'website/release.md', '# Next stable release\n')
    const nextReleaseSha = commit(cwd)
    const next = makeRecord(nextReleaseSha)
    await store.github.writeAutomationState(`releases/${next.id}`, next)
    await put(cwd, 'packages/core/src/index.ts', 'export const unreleased = true\n')
    commit(cwd)
    await put(cwd, 'website/index.md', '# Stable\n\nCorrected explanation.\n')
    const correction = commit(cwd)
    expect(await planDocsDeployment({ ...options, commits: [correction] })).toMatchObject({ eligible: true, sourceSha: sha, commits: [correction] })
    await deployDocs({ ...options, commits: [correction], spawn })
    const carried = await planDocsDeployment({ ...options, release: next.id })
    expect(carried.commits).toEqual([correction])
    await deployDocs({ ...options, release: next.id, spawn })
    await put(cwd, 'packages/core/src/index.ts', 'export const value = "released"\n')
    const includedSha = commit(cwd)
    const included = makeRecord(includedSha)
    await store.github.writeAutomationState(`releases/${included.id}`, included)
    expect((await planDocsDeployment({ ...options, release: included.id })).commits).toEqual([])
  })

  it('blocks a mixed code/documentation commit without copying any main content', async () => {
    const { options, cwd } = await fixture()
    await put(cwd, 'website/index.md', '# Stable\n\nCorrected explanation.\n')
    await put(cwd, 'packages/core/src/index.ts', 'export const unreleased = true\n')
    const correction = commit(cwd)
    const plan = await planDocsDeployment({ ...options, commits: [correction] })
    expect(plan.eligible).toBe(false)
    expect(plan.blockers.join('\n')).toContain('protected or unlisted path: packages/core/src/index.ts')
  })

  it('preserves Markdown hard-break whitespace in the selected patch', async () => {
    const { options, cwd } = await fixture()
    const content = '# Stable\n\nCorrected explanation.  \n'
    await put(cwd, 'website/index.md', content)
    const correction = commit(cwd)
    const exact = ((_command: string, args: string[], input: { cwd: string, env: NodeJS.ProcessEnv }) => {
      if (args[1] === 'docs:stable') {
        expect(readFileSync(path.join(input.cwd, 'website/index.md'), 'utf8')).toBe(content)
        writeFileSync(input.env['REPO_DOCS_RESULT_FILE']!, JSON.stringify({ versionId: 'whitespace-preserved' }))
      }
      return { status: 0, stdout: '', stderr: '' }
    }) as unknown as NonNullable<DocsOptions['spawn']>
    expect((await deployDocs({ ...options, commits: [correction], spawn: exact })).status).toBe('deployed')
  })

  it('reports a correction that depends on unshipped prose as a conflict', async () => {
    const { options, cwd } = await fixture()
    await put(cwd, 'website/index.md', '# Future feature\n\nThis requires new runtime behavior.\n')
    commit(cwd)
    await put(cwd, 'website/index.md', '# Future feature\n\nThis requires corrected new runtime behavior.\n')
    const correction = commit(cwd)
    const plan = await planDocsDeployment({ ...options, commits: [correction] })
    expect(plan.eligible).toBe(false)
    expect(plan.blockers.join('\n')).toContain('conflicts with the stable source')
  })

  it('does not permit automation instructions even if a permissive patch glob was configured', async () => {
    const { options, cwd } = await fixture()
    options.config!.sites!['website']!.patchPaths = ['**/*.md']
    await put(cwd, 'AGENTS.md', 'Changed repository instructions\n')
    const correction = commit(cwd)
    const plan = await planDocsDeployment({ ...options, commits: [correction] })
    expect(plan.eligible).toBe(false)
    expect(plan.blockers.join('\n')).toContain('protected or unlisted path: AGENTS.md')
  })
})
