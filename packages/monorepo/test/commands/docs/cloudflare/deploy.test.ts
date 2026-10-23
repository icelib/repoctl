import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { deployDocs, planDocsDeployment } from '@icebreakers/monorepo'
import path from 'pathe'
import { afterEach, expect, it } from 'vitest'
import { cleanup, expectDocsFailure } from '../helpers'
import { api, nativeFixture, otherVersion, versionId } from './helpers'

afterEach(cleanup)

it('deploys with the frozen local CLI, explicit config/environment and public artifact identity', async () => {
  const h = await nativeFixture()
  const result = await deployDocs(h.options)
  expect(result).toMatchObject({ status: 'deployed', versionId, url: 'https://docs.example.invalid' })
  expect(h.calls[2]).toEqual(['exec', 'node', path.join(h.state.source, 'website/node_modules/wrangler/cli.js'), 'deploy', '--config', path.join(h.state.source, 'website/wrangler.jsonc'), '--env', '', '--message', `repoctl-docs:${result.plan.deploymentId}`])
  expect(h.state.manifest).toEqual({ schemaVersion: 1, site: 'website', channel: 'stable', deploymentId: result.plan.deploymentId, sourceSha: result.plan.sourceSha, treeSha: result.plan.treeSha, releaseId: result.plan.releaseId })
  expect(JSON.stringify(h.state.manifest)).not.toMatch(/secret-token|accountId/)
  expect(h.request.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' })
  expect(existsSync(path.dirname(h.state.output))).toBe(false)
  expect((await deployDocs(h.options)).status).toBe('skipped')
  expect(h.state.uploadCount).toBe(1)
})

it('does not fall through to a global Wrangler when no local dependency is installed', async () => {
  const h = await nativeFixture()
  h.callback.spawn = (args, source) => {
    if (args[1] === 'docs:build') {
      rmSync(path.join(source, 'website/node_modules'), { recursive: true })
    }
  }
  await expectDocsFailure(deployDocs(h.options), 'provider', 'wrangler-missing')
  expect(h.state.uploadCount).toBe(0)
  expect(h.store.records.get('docs/website/stable')!.value).not.toHaveProperty('pending')
})

it.each([
  { worker_name: 'wrong-worker' },
  { wrangler_environment: 'wrong-env' },
  { wrangler_environment: null },
  { version_id: 'invalid' },
  { version: 2 },
])('rejects unexpected Wrangler output: %o', async (change) => {
  const h = await nativeFixture()
  h.callback.spawn = (args, _cwd, env) => {
    if (args[0] === 'exec') {
      writeFileSync(env['WRANGLER_OUTPUT_FILE_PATH']!, JSON.stringify({ type: 'deploy', version: 1, worker_name: 'docs-stable', wrangler_environment: '', version_id: versionId, ...change }))
    }
  }
  await expectDocsFailure(deployDocs(h.options), 'provider', 'wrangler-result-invalid')
  expect(h.store.records.get('docs/website/stable')!.value).toHaveProperty('pending.phase', 'deploying')
  expect(existsSync(path.dirname(h.state.output))).toBe(false)
})

it('requires post-upload API confirmation of the exact reported version', async () => {
  const h = await nativeFixture()
  const original = h.request.getMockImplementation()!
  h.request.mockImplementation(async (url) => {
    if (!h.state.uploadCount) {
      return original(url)
    }
    return String(url).endsWith('/deployments')
      ? api({ deployments: [{ created_on: '2026-10-23T00:00:00Z', strategy: 'percentage', versions: [{ version_id: otherVersion, percentage: 100 }] }] })
      : api({ id: otherVersion, annotations: { 'workers/message': h.state.message } })
  })
  await expectDocsFailure(deployDocs(h.options), 'provider', 'provider-version-inactive')
  expect(h.store.records.get('docs/website/stable')!.value).toHaveProperty('pending.phase', 'deploying')
})

it('recovers repeated final-checkpoint failures after one upload without reuploading', async () => {
  const h = await nativeFixture()
  const write = h.store.github.writeAutomationState
  let failures = 2
  h.store.github.writeAutomationState = async (key, value, revision) => {
    if (key === 'docs/website/stable' && value && typeof value === 'object' && 'current' in value && failures-- > 0) {
      throw new Error('checkpoint persistence failed')
    }
    return write(key, value, revision)
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    await expectDocsFailure(deployDocs(h.options), 'finalize', 'checkpoint-write-failed')
    expect(h.store.records.get('docs/website/stable')!.value).toHaveProperty('pending.phase', 'deploying')
    expect(h.state.uploadCount).toBe(1)
  }
  expect((await deployDocs(h.options)).status).toBe('deployed')
  expect(h.state.uploadCount).toBe(1)
})

it('recovers a successful upload whose local result write failed', async () => {
  const h = await nativeFixture()
  h.callback.spawn = (args) => {
    if (args[0] === 'exec') {
      rmSync(h.state.output)
      throw new Error('result write failed')
    }
  }
  await expectDocsFailure(deployDocs(h.options), 'provider', 'provider-failed')
  h.callback.spawn = undefined
  expect((await deployDocs(h.options)).status).toBe('deployed')
  expect(h.state.uploadCount).toBe(1)
})

it('preserves an unknown upload outcome when retry preflight or local acceptance fails', async () => {
  const h = await nativeFixture()
  h.callback.spawn = (args) => {
    if (args[0] === 'exec') {
      throw new Error('upload response lost')
    }
  }
  await expectDocsFailure(deployDocs(h.options), 'provider', 'provider-failed')
  await expectDocsFailure(deployDocs({ ...h.options, env: { ...h.options.env, CLOUDFLARE_API_TOKEN: '' } }), 'preflight', 'credentials-missing')
  expect(h.store.records.get('docs/website/stable')!.value).toHaveProperty('pending.phase', 'deploying')
  h.callback.spawn = (args, source) => {
    if (args[1] === 'docs:build') {
      rmSync(path.join(source, 'website/node_modules'), { recursive: true })
    }
  }
  await expectDocsFailure(deployDocs(h.options), 'provider', 'wrangler-missing')
  expect(h.store.records.get('docs/website/stable')!.value).toHaveProperty('pending.phase', 'deploying')
  h.callback.spawn = undefined
  expect((await deployDocs(h.options)).status).toBe('deployed')
  expect(h.state.uploadCount).toBe(1)
})

it('recovers a frozen script deployment after live configuration switches to the native provider', async () => {
  const h = await nativeFixture()
  const native = h.site.stable
  h.site.stable = { deployScript: 'docs:stable', url: 'https://original.example.invalid' }
  const planned = await planDocsDeployment(h.options)
  h.callback.spawn = (args) => {
    if (args[1] === 'docs:stable') {
      throw new Error('script result lost')
    }
  }
  await expectDocsFailure(deployDocs(h.options), 'provider', 'provider-failed')
  h.site.stable = native
  h.request.mockImplementation(async () => {
    throw new Error('native fetch must not run')
  })
  h.callback.spawn = (args, _source, env) => {
    if (args[1] === 'docs:stable') {
      expect(env['REPO_DOCS_URL']).toBe('https://original.example.invalid')
      writeFileSync(env['REPO_DOCS_RESULT_FILE']!, JSON.stringify({ versionId: 'script-version' }))
    }
  }
  const result = await deployDocs(h.options)
  expect(result.plan.deploymentId).toBe(planned.deploymentId)
  expect(result.versionId).toBe('script-version')
  expect(h.request).not.toHaveBeenCalled()
})
