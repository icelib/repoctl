/* eslint test/no-import-node-test: off -- These deployment regressions run with node --test outside workspace Vitest projects. */
import assert from 'node:assert/strict'
import { it } from 'node:test'
import { activeMatchingVersion, cloudflareClient, readDeploymentVersion } from './cloudflare.mjs'
import { assertBuildIdentity, assertDeploymentContext, buildIdentity, deploymentMessage, docsTargets } from './identity.mjs'

const versionId = '12345678-1234-1234-1234-123456789abc'
const env = {
  REPO_DOCS_SITE: 'website',
  REPO_DOCS_CHANNEL: 'stable',
  REPO_DOCS_SOURCE_SHA: 'a'.repeat(40),
  REPO_DOCS_DEPLOYMENT_ID: 'b'.repeat(64),
  REPO_DOCS_RELEASE_ID: 'release-completed',
  REPO_DOCS_RESULT_FILE: '/tmp/result.json',
  REPO_DOCS_URL: docsTargets.stable.url,
  GITHUB_ACTIONS: 'true',
  GITHUB_RUN_ID: '1',
  REPO_DOCS_CONCURRENCY_GROUP: 'docs-website-stable',
}
const identity = buildIdentity(env)

function provider({ message = deploymentMessage(identity), versions = [{ version_id: versionId, percentage: 100 }] } = {}) {
  return async (_worker, endpoint) => endpoint === 'deployments'
    ? { deployments: [{ created_on: '2026-10-23T00:00:00Z', versions }] }
    : { id: versionId, annotations: { 'workers/message': message } }
}

it('local builds default to an unpublished preview and direct deployment is rejected', () => {
  assert.equal(buildIdentity({}, 'a'.repeat(40)).channel, 'preview')
  assert.throws(() => assertDeploymentContext({}, 'preview'), /Direct website deployment/)
  assert.throws(() => buildIdentity({ REPO_DOCS_CHANNEL: 'stable' }), /Direct website deployment/)
})

it('stable requires its release, workflow, source, and serialized production context', () => {
  assert.doesNotThrow(() => assertDeploymentContext(env, 'stable'))
  for (const key of ['REPO_DOCS_RELEASE_ID', 'GITHUB_ACTIONS', 'GITHUB_RUN_ID', 'REPO_DOCS_CONCURRENCY_GROUP']) {
    assert.throws(() => assertDeploymentContext({ ...env, [key]: '' }, 'stable'), /managed docs-website-stable/)
  }
  for (const key of ['REPO_DOCS_SITE', 'REPO_DOCS_SOURCE_SHA', 'REPO_DOCS_DEPLOYMENT_ID', 'REPO_DOCS_RESULT_FILE', 'REPO_DOCS_URL']) {
    assert.throws(() => assertDeploymentContext({ ...env, [key]: '' }, 'stable'), /Direct website deployment/)
  }
})

it('a stale artifact or preview artifact cannot be sent to production', () => {
  assert.doesNotThrow(() => assertBuildIdentity(identity, identity))
  for (const key of Object.keys(identity)) {
    assert.throws(() => assertBuildIdentity({ ...identity, [key]: 'mismatch' }, identity), /artifact does not match/)
  }
  assert.throws(() => assertDeploymentContext({ ...env, REPO_DOCS_CHANNEL: 'preview' }, 'stable'), /Direct website deployment/)
})

it('retries reconcile exactly the active deployment identity, not another version', async () => {
  assert.equal(await activeMatchingVersion(provider(), 'repoctl-docs', identity), versionId)
  assert.equal(await activeMatchingVersion(provider({ message: 'another-release' }), 'repoctl-docs', identity), undefined)
  assert.equal(await activeMatchingVersion(async () => undefined, 'repoctl-docs-next', identity), undefined)
  await assert.rejects(activeMatchingVersion(provider({ versions: [{ version_id: versionId, percentage: 50 }] }), 'repoctl-docs', identity), /100%/)
  await assert.rejects(activeMatchingVersion(async () => ({}), 'repoctl-docs', identity), /invalid deployments/)
})

it('Wrangler output must identify the intended Worker and environment', () => {
  const output = [
    { type: 'deploy', worker_name: 'repoctl-docs-next', wrangler_environment: 'next', version_id: 'preview-version' },
    { type: 'deploy', worker_name: 'repoctl-docs', version_id: 'stable-version' },
  ].map(entry => JSON.stringify(entry)).join('\n')
  assert.equal(readDeploymentVersion(output, 'repoctl-docs', ''), 'stable-version')
  assert.equal(readDeploymentVersion(output, 'repoctl-docs-next', 'next'), 'preview-version')
  assert.throws(() => readDeploymentVersion(output, 'repoctl-docs-next', ''), /did not report/)
  assert.throws(() => readDeploymentVersion('{broken', 'repoctl-docs', ''), SyntaxError)
})

it('only an explicit missing Worker may be treated as a first deployment', async () => {
  const credentials = { CLOUDFLARE_API_TOKEN: 'private-token', CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32) }
  let requestUrl
  const missing = cloudflareClient(credentials, async (url, options) => {
    requestUrl = url
    assert.equal(options.headers.Authorization, 'Bearer private-token')
    return Response.json({ success: false, errors: [{ code: 10007 }] }, { status: 404 })
  })
  assert.equal(await missing('repoctl-docs-next', 'deployments', true), undefined)
  assert.match(requestUrl, /workers\/scripts\/repoctl-docs-next\/deployments$/u)
  await assert.rejects(missing('repoctl-docs', 'versions/missing'), /HTTP 404/)
  const denied = cloudflareClient(credentials, async () => Response.json({ success: false, errors: [{ code: 10000 }] }, { status: 403 }))
  await assert.rejects(denied('repoctl-docs', 'deployments', true), /HTTP 403/)
  assert.throws(() => cloudflareClient({}), /required to verify/)
})
