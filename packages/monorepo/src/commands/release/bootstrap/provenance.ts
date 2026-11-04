import type { BootstrapManifest, BootstrapOptions } from './types'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readBounded, record } from '../snapshot/prepared/github/client'
import { bootstrapRegistry, bootstrapWorkflow } from './schema'

/** 签名验证之外还必须绑定实际上传运行，避免把其他 workflow 的发布算作首次验证。 */
export async function verifyBootstrapProvenance(manifest: BootstrapManifest, url: string, options: BootstrapOptions) {
  const endpoint = new URL(url)
  assert.equal(endpoint.origin, new URL(bootstrapRegistry).origin)
  assert.ok(!endpoint.username && !endpoint.password && !endpoint.hash && endpoint.pathname.startsWith('/-/npm/v1/attestations/'))
  const response = await (options.registryFetch ?? globalThis.fetch)(endpoint, { redirect: 'error', signal: AbortSignal.timeout(30_000) })
  assert.ok(response.ok, `Bootstrap provenance is unavailable: HTTP ${response.status}`)
  const body = record(JSON.parse(new TextDecoder().decode(await readBounded(response, 4 * 1024 * 1024))))
  assert.ok(Array.isArray(body['attestations']))
  const attestations = body['attestations'].filter(item => record(item)['predicateType'] === 'https://slsa.dev/provenance/v1')
  assert.equal(attestations.length, 1, 'Bootstrap requires one SLSA v1 publication attestation')
  const envelope = record(record(record(attestations[0])['bundle'])['dsseEnvelope'])
  assert.ok(typeof envelope['payload'] === 'string')
  const statement = record(JSON.parse(Buffer.from(envelope['payload'], 'base64').toString('utf8')))
  assert.equal(statement['predicateType'], 'https://slsa.dev/provenance/v1')
  assert.ok(Array.isArray(statement['subject']) && statement['subject'].length === 1)
  const subject = record(statement['subject'][0])
  assert.equal(subject['name'], `pkg:npm/${manifest.package.name.replace(/^@/u, '%40')}@${manifest.package.version}`)
  assert.equal(record(subject['digest'])['sha512'], Buffer.from(manifest.package.integrity.slice('sha512-'.length), 'base64').toString('hex'))
  const predicate = record(statement['predicate'])
  const definition = record(predicate['buildDefinition'])
  const repository = `https://github.com/${manifest.source.repository}`
  assert.deepEqual(record(record(definition['externalParameters'])['workflow']), { ref: `refs/heads/${manifest.source.branch}`, repository, path: bootstrapWorkflow })
  const identity = record(record(definition['internalParameters'])['github'])
  assert.equal(identity['repository_id'], String(manifest.source.repositoryId))
  assert.equal(identity['event_name'], 'workflow_dispatch')
  assert.ok(Array.isArray(definition['resolvedDependencies']) && definition['resolvedDependencies'].some((item) => {
    const dependency = record(item)
    return dependency['uri'] === `git+${repository}@refs/heads/${manifest.source.branch}` && record(dependency['digest'])['gitCommit'] === manifest.source.commit
  }), 'Bootstrap provenance source differs from the frozen default branch commit')
  assert.equal(record(record(predicate['runDetails'])['metadata'])['invocationId'], `${repository}/actions/runs/${manifest.source.runId}/attempts/${manifest.source.runAttempt}`)
}
