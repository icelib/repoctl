import { deployDocs, DocsDeploymentError, planDocsDeployment } from '@icebreakers/monorepo'
import { afterEach, expect, it, vi } from 'vitest'
import { docsManifest } from '../../../../src/commands/docs/manifest'
import { cleanup, commit, makeRecord, put } from '../helpers'
import { readinessFixture, scriptRunner } from './helpers'

afterEach(cleanup)

it('persists verifying before the first public request and advances current only after identity verification', async () => {
  const h = await readinessFixture()
  const observations: { url: unknown, headers: unknown, state: ReturnType<typeof h.state> }[] = []
  h.options.fetch = vi.fn<typeof fetch>(async (url, init) => {
    observations.push({ url, headers: init?.headers, state: structuredClone(h.state()) })
    return Response.json(docsManifest(h.plan))
  })
  const result = await deployDocs(h.options)
  expect(observations).toHaveLength(1)
  expect(observations[0]!.url).toBe('https://docs.example.invalid/.well-known/repoctl-deployment.json')
  expect(observations[0]!.headers).not.toHaveProperty('Authorization')
  expect(observations[0]!.state.pending).toMatchObject({ phase: 'verifying', receipt: { versionId: 'saved-script-version' } })
  expect(observations[0]!.state.current).toBeUndefined()
  expect(result).toMatchObject({ status: 'deployed', versionId: 'saved-script-version' })
  expect(h.state().pending).toBeUndefined()
  expect(h.state().current?.deploymentId).toBe(h.plan.deploymentId)
  expect(result.report?.stages.map(stage => stage.stage)).toEqual(['plan', 'preflight', 'install', 'build', 'provider', 'readiness', 'finalize'])
  expect(result.report?.stages.every(stage => stage.status === 'completed' && stage.elapsedMs >= 0)).toBe(true)
})

it('keeps the previous current and retries a saved script receipt without install, build or upload', async () => {
  const h = await readinessFixture()
  await deployDocs(h.options)
  const old = structuredClone(h.state().current)
  await put(h.cwd, 'website/next.md', '# Next release\n')
  const next = makeRecord(commit(h.cwd))
  await h.store.github.writeAutomationState(`releases/${next.id}`, next)
  h.options.release = next.id
  const plan = await planDocsDeployment(h.options)
  h.request.mockImplementation(async () => Response.json(docsManifest(h.plan)))
  let error: unknown
  try {
    await deployDocs(h.options)
  }
  catch (caught) {
    error = caught
  }
  expect(error).toBeInstanceOf(DocsDeploymentError)
  expect(error).toMatchObject({ report: { failedStage: 'readiness', resumablePhase: 'verifying', versionId: 'saved-script-version' } })
  expect(h.state().current).toEqual(old)
  expect(h.state().pending?.receipt?.versionId).toBe('saved-script-version')
  const { release: _release, ...omitted } = h.options
  await expect(planDocsDeployment(omitted)).rejects.toMatchObject({ reason: 'deployment-unresolved' })
  const retry = vi.fn(() => {
    throw new Error('must not install/build/upload')
  })
  h.request.mockImplementation(async () => Response.json(docsManifest(plan)))
  const result = await deployDocs({ ...h.options, spawn: retry, config: { sites: {} }, env: { ...h.options.env, GITHUB_RUN_ID: '124' } })
  expect(retry).not.toHaveBeenCalled()
  expect(result.plan.deploymentId).toBe(plan.deploymentId)
  expect(result.report?.stages).toEqual(expect.arrayContaining([
    expect.objectContaining({ stage: 'install', status: 'skipped', reason: 'resumed-verification' }),
    expect.objectContaining({ stage: 'build', status: 'skipped', reason: 'resumed-verification' }),
    expect.objectContaining({ stage: 'provider', status: 'completed', operation: 'reconcile' }),
  ]))
  expect(h.state().current?.deploymentId).toBe(plan.deploymentId)
})

it('keeps first-deployment verification recoverable when the live site disappears and release is omitted', async () => {
  const h = await readinessFixture()
  h.request.mockImplementation(async () => Response.json({ stale: true }))
  await expect(deployDocs(h.options)).rejects.toMatchObject({ report: { resumablePhase: 'verifying' } })
  const { release: _release, ...options } = h.options
  h.request.mockImplementation(async () => Response.json(docsManifest(h.plan)))
  const retry = scriptRunner()
  const result = await deployDocs({ ...options, config: { sites: {} }, spawn: retry.spawn })
  expect(result.plan.releaseId).toBe(h.plan.releaseId)
  expect(retry.calls).toEqual([])
})

it('blocks a different stable release or correction request while verification is unresolved', async () => {
  const h = await readinessFixture()
  h.request.mockImplementation(async () => Response.json({ stale: true }))
  await expect(deployDocs(h.options)).rejects.toMatchObject({ report: { resumablePhase: 'verifying' } })
  const saved = structuredClone(h.state())
  await put(h.cwd, 'website/correction.md', '# Correction\n')
  const sha = commit(h.cwd)
  const next = makeRecord(sha)
  await h.store.github.writeAutomationState(`releases/${next.id}`, next)
  const process = scriptRunner()
  for (const change of [{ release: next.id }, { commits: [sha] }]) {
    await expect(deployDocs({ ...h.options, ...change, spawn: process.spawn })).rejects.toMatchObject({ report: { failedStage: 'plan' } })
  }
  expect(process.calls).toEqual([])
  expect(h.state()).toEqual(saved)
})

it('preserves verifying when final checkpoint persistence fails and reuses it on retry', async () => {
  const h = await readinessFixture()
  const write = h.store.github.writeAutomationState
  let rejectFinal = true
  h.store.github.writeAutomationState = async (key, state, revision) => {
    if (rejectFinal && state && typeof state === 'object' && 'current' in state) {
      throw new Error('secret response from storage')
    }
    return write(key, state, revision)
  }
  await expect(deployDocs(h.options)).rejects.toMatchObject({ report: { failedStage: 'finalize', resumablePhase: 'verifying' } })
  expect(h.state().pending?.phase).toBe('verifying')
  rejectFinal = false
  const process = scriptRunner()
  expect((await deployDocs({ ...h.options, spawn: process.spawn })).status).toBe('deployed')
  expect(process.calls).toEqual([])
})

it('cannot overwrite a competing claim acquired during public verification', async () => {
  const h = await readinessFixture()
  let replacement: unknown
  h.options.fetch = vi.fn(async () => {
    const key = 'docs/website/stable'
    const current = h.store.records.get(key)!
    replacement = structuredClone(current.value)
    const state = h.state()
    state.pending!.runId = 'other-run'
    h.store.records.set(key, { value: state, revision: 'competing' })
    return Response.json(docsManifest(h.plan))
  })
  await expect(deployDocs(h.options)).rejects.toMatchObject({ report: { failedStage: 'finalize' } })
  expect(replacement).toBeDefined()
  expect(h.state().pending?.runId).toBe('other-run')
  expect(h.state().current).toBeUndefined()
  expect(h.store.records.get('docs/website/stable')?.revision).toBe('competing')
})

it('rechecks preview main after polling and allows only the serialized latest preview to supersede it', async () => {
  const h = await readinessFixture('preview')
  const readMain = h.store.github.readBranchHead
  h.options.fetch = vi.fn(async () => {
    h.store.github.readBranchHead = async () => 'f'.repeat(40)
    return Response.json(docsManifest(h.plan))
  })
  await expect(deployDocs(h.options)).rejects.toMatchObject({ report: { failedStage: 'finalize', resumablePhase: 'verifying' } })
  await put(h.cwd, 'website/new.md', '# New main\n')
  commit(h.cwd)
  h.store.github.readBranchHead = readMain
  const sourceSha = await h.store.github.readBranchHead('main')
  const options = { ...h.options, sourceSha }
  const plan = await planDocsDeployment(options)
  const process = scriptRunner()
  await expect(deployDocs({ ...options, env: { GITHUB_REPOSITORY: 'example/project' }, spawn: process.spawn })).rejects.toMatchObject({ report: { failedStage: 'preflight' } })
  expect(process.calls).toEqual([])
  const result = await deployDocs({ ...options, fetch: vi.fn(async () => Response.json(docsManifest(plan))), spawn: process.spawn })
  expect(result.plan.sourceSha).toBe(sourceSha)
  expect(process.calls).toHaveLength(3)
})
