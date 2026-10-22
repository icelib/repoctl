import type { DocsOptions } from '@icebreakers/monorepo'
import { writeFileSync } from 'node:fs'
import { deployDocs, planDocsDeployment } from '@icebreakers/monorepo'
import { afterEach, expect, it } from 'vitest'
import { cleanup, commit, fixture, makeRecord, put } from './helpers'

afterEach(cleanup)

function runner(callback?: (args: string[]) => void) {
  return ((_command: string, args: string[], options: { env: NodeJS.ProcessEnv }) => {
    callback?.(args)
    if (args[1] === 'docs:preview') {
      writeFileSync(options.env['REPO_DOCS_RESULT_FILE']!, JSON.stringify({ versionId: 'preview-version' }))
    }
    return { status: 0, stdout: '', stderr: '' }
  }) as unknown as NonNullable<DocsOptions['spawn']>
}

async function interruptedPreview() {
  const { cwd, sha, store, options } = await fixture()
  const { release: _release, ...previewOptions } = options
  const preview: DocsOptions = {
    ...previewOptions,
    channel: 'preview',
    sourceSha: sha,
    env: { ...options.env, REPO_DOCS_CONCURRENCY_GROUP: 'docs-website-preview' },
  }
  await expect(deployDocs({ ...preview, spawn: runner((args) => {
    if (args[1] === 'docs:preview') {
      throw new Error('upload response lost')
    }
  }) })).rejects.toThrow('upload response lost')
  expect(store.records.get('docs/website/preview')!.value).toHaveProperty('pending.phase', 'deploying')
  return { cwd, sha, store, preview }
}

it('supersedes an interrupted older preview only with the serialized latest main source', async () => {
  const { cwd, store, preview } = await interruptedPreview()
  await put(cwd, 'website/new.md', '# Latest preview\n')
  const sourceSha = commit(cwd)
  expect(await planDocsDeployment(preview)).toMatchObject({ eligible: false })
  const latest = { ...preview, sourceSha }
  await expect(deployDocs({ ...latest, env: { GITHUB_REPOSITORY: 'example/project' }, spawn: runner() })).rejects.toThrow('unfinished deploying')
  const result = await deployDocs({ ...latest, spawn: runner((args) => {
    if (args[1] === 'docs:build') {
      expect(store.records.get('docs/website/preview')!.value).toHaveProperty('pending.phase', 'building')
    }
  }) })
  expect(result.status).toBe('deployed')
  expect(store.records.get('docs/website/preview')!.value).toHaveProperty('current.sourceSha', sourceSha)
  expect(store.records.get('docs/website/preview')!.value).not.toHaveProperty('pending')
})

it('clears a failed replacement build while retaining an unknown outcome for an identical retry', async () => {
  const { cwd, store, preview } = await interruptedPreview()
  const failedBuild = runner((args) => {
    if (args[1] === 'docs:build') {
      throw new Error('preview build failed')
    }
  })
  await expect(deployDocs({ ...preview, spawn: failedBuild })).rejects.toThrow('preview build failed')
  expect(store.records.get('docs/website/preview')!.value).toHaveProperty('pending.phase', 'deploying')
  await put(cwd, 'website/new.md', '# Latest preview\n')
  const sourceSha = commit(cwd)
  const latest = { ...preview, sourceSha }
  await expect(deployDocs({ ...latest, spawn: failedBuild })).rejects.toThrow('preview build failed')
  expect(store.records.get('docs/website/preview')!.value).not.toHaveProperty('pending')
  expect((await deployDocs({ ...latest, spawn: runner() })).status).toBe('deployed')
  expect(store.records.get('docs/website/preview')!.value).toHaveProperty('current.sourceSha', sourceSha)
})

it('keeps a different stable release blocked until its pending provider outcome is reconciled', async () => {
  const { cwd, options, store } = await fixture()
  await expect(deployDocs({ ...options, spawn: runner((args) => {
    if (args[1] === 'docs:stable') {
      throw new Error('stable upload response lost')
    }
  }) })).rejects.toThrow('stable upload response lost')
  await put(cwd, 'website/new.md', '# New stable source\n')
  const record = makeRecord(commit(cwd))
  await store.github.writeAutomationState(`releases/${record.id}`, record)
  let executed = false
  await expect(deployDocs({ ...options, release: record.id, spawn: runner(() => {
    executed = true
  }) })).rejects.toThrow('unfinished deploying')
  expect(executed).toBe(false)
  expect(store.records.get('docs/website/stable')!.value).toHaveProperty('pending.phase', 'deploying')
})
