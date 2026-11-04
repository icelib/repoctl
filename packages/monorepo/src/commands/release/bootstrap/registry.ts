import type { BootstrapManifest, BootstrapOptions, BootstrapReport } from './types'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { sleep } from '../registry'
import { registrySettings } from '../registry/settings'
import { readBounded, record } from '../snapshot/prepared/github/client'
import { verifyBootstrapProvenance } from './provenance'
import { bootstrapRegistry } from './schema'

async function metadata(path: string, options: BootstrapOptions, deadline = performance.now() + 30_000) {
  const response = await (options.registryFetch ?? globalThis.fetch)(`${bootstrapRegistry}${path}`, { redirect: 'error', headers: { 'accept': 'application/json', 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(Math.max(1, Math.floor(Math.min(30_000, deadline - performance.now())))) })
  if (response.status === 404) {
    await response.body?.cancel()
    return undefined
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`Bootstrap registry metadata is unknown: HTTP ${response.status}.`)
  }
  return record(JSON.parse(new TextDecoder().decode(await readBounded(response, 16 * 1024 * 1024))))
}

export async function bootstrapTags(name: string, options: BootstrapOptions) {
  const tags = await metadata(`-/package/${encodeURIComponent(name)}/dist-tags`, options) ?? {}
  assert.ok(Object.values(tags).every(value => typeof value === 'string'))
  return tags as Record<string, string>
}

export function bootstrapVersion(manifest: BootstrapManifest, options: BootstrapOptions, deadline?: number) {
  return metadata(`${encodeURIComponent(manifest.package.name)}/${encodeURIComponent(manifest.package.version)}`, options, deadline)
}

/** 除首次唯一真实版本的服务端初始化外，所有未选择的标签保持原值。 */
export async function assertBootstrapTags(manifest: BootstrapManifest, before: Record<string, string>, options: BootstrapOptions, published = false): Promise<NonNullable<BootstrapReport['latestState']>> {
  const after = await bootstrapTags(manifest.package.name, options)
  let bootstrapPromoted = false
  const latestBefore = before['latest'] ?? null
  const latestAfter = after['latest'] ?? null
  if (latestAfter !== latestBefore && (latestBefore === null || latestBefore === '0.0.0-stage') && latestAfter === manifest.package.version && published) {
    const packument = await metadata(encodeURIComponent(manifest.package.name), options)
    const versions = Object.keys(record(packument?.['versions']))
    bootstrapPromoted = versions.includes(manifest.package.version) && versions.every(version => version === manifest.package.version || version === '0.0.0-stage')
  }
  assert.ok(latestBefore === latestAfter || bootstrapPromoted, 'Bootstrap changed the latest tag or observed a concurrent publication')
  for (const tag of new Set([...Object.keys(before), ...manifest.protectedTags])) {
    if (tag !== manifest.tag && tag !== 'latest') {
      assert.equal(after[tag], before[tag], `Bootstrap observed concurrent dist-tag change: ${tag}`)
    }
  }
  const target = after[manifest.tag]
  assert.ok(target === before[manifest.tag] || (published && target === manifest.package.version), 'Bootstrap target tag changed concurrently')
  return { before: latestBefore, after: latestAfter, bootstrapPromoted }
}

/** 只等待已接受版本的可见性；完整性冲突立即失败，不触发第二次上传。 */
export async function confirmBootstrapRegistry(report: BootstrapReport, options: BootstrapOptions) {
  const manifest = report.manifest!
  const budget = registrySettings(options).visibilityTimeoutMs
  const started = performance.now()
  let virtualWait = 0
  const remaining = () => Math.max(0, budget - (performance.now() - started + virtualWait))
  while (remaining() > 0) {
    const remote = await bootstrapVersion(manifest, options, performance.now() + remaining())
    report.latestState = await assertBootstrapTags(manifest, report.baselineTags!, options, true)
    const tags = await bootstrapTags(manifest.package.name, options)
    if (remote) {
      assert.equal(remote['name'], manifest.package.name)
      assert.equal(remote['version'], manifest.package.version)
      const dist = record(remote['dist'])
      assert.equal(dist['integrity'], manifest.package.integrity, 'Published bootstrap integrity differs from the frozen tarball')
      if (dist['attestations'] !== undefined && tags[manifest.tag] === manifest.package.version) {
        const attestation = record(dist['attestations'])
        const predicateType = record(attestation['provenance'])['predicateType']
        assert.equal(predicateType, 'https://slsa.dev/provenance/v1')
        const url = new URL(String(attestation['url']))
        assert.equal(url.origin, new URL(bootstrapRegistry).origin)
        assert.ok(!url.username && !url.password && !url.hash)
        await verifyBootstrapProvenance(manifest, url.href, options)
        report.provenance = { url: url.href, predicateType }
        report.confirmed = true
        return
      }
    }
    const duration = Math.min(10_000, remaining())
    const before = performance.now()
    await sleep(duration, options)
    virtualWait += Math.max(0, duration - (performance.now() - before))
  }
  throw new Error('Bootstrap registry confirmation timed out; preserve the accepted upload and use verify-run-id without publishing again.')
}
