import type { BootstrapOptions } from '../../../../src/commands/release/bootstrap/types'
import { expect, it, vi } from 'vitest'
import { assertBootstrapTags, bootstrapTags, confirmBootstrapRegistry } from '../../../../src/commands/release/bootstrap/registry'
import { attestationBody, attestationUrl, bootstrapStatement, boundaryFixture, jsonResponse } from './boundary-fixture'

function registryFixture() {
  const h = boundaryFixture()
  const state = {
    tags: { ...h.report.baselineTags!, alpha: h.manifest.package.version } as Record<string, string>,
    versions: ['0.1.0', h.manifest.package.version],
    visibleAfter: 0,
    versionRequests: 0,
    integrity: h.manifest.package.integrity,
    statement: bootstrapStatement(h.manifest),
  }
  const url = attestationUrl(h.manifest)
  const versionPath = `/${encodeURIComponent(h.manifest.package.name)}/${h.manifest.package.version}`
  const fetcher = vi.fn(async (input: Parameters<typeof globalThis.fetch>[0]) => {
    const endpoint = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (endpoint.href === url) {
      return jsonResponse(attestationBody(state.statement))
    }
    if (endpoint.pathname === versionPath) {
      state.versionRequests += 1
      return state.versionRequests <= state.visibleAfter
        ? jsonResponse({ error: 'Not found' }, 404)
        : jsonResponse({ name: h.manifest.package.name, version: h.manifest.package.version, dist: { integrity: state.integrity, attestations: { url, provenance: { predicateType: 'https://slsa.dev/provenance/v1' } } } })
    }
    if (endpoint.pathname.endsWith('/dist-tags')) {
      return jsonResponse(state.tags)
    }
    if (endpoint.pathname === `/${encodeURIComponent(h.manifest.package.name)}`) {
      return jsonResponse({ versions: Object.fromEntries(state.versions.map(version => [version, {}])) })
    }
    throw new Error(`Unexpected registry request: ${endpoint.pathname}`)
  })
  const sleep = vi.fn(async () => {})
  const spawn = vi.fn(() => {
    throw new Error('Registry confirmation must never upload or build')
  })
  const oidc = vi.fn(() => {
    throw new Error('Registry confirmation must never request OIDC')
  })
  const options: BootstrapOptions = { ...h.options, registryFetch: fetcher, fetch: oidc, sleep, spawn: spawn as unknown as NonNullable<BootstrapOptions['spawn']> }
  return { ...h, state, fetcher, sleep, spawn, oidc, options }
}

it('confirms an accepted upload after propagation without invoking another upload, rebuild or OIDC exchange', async () => {
  const h = registryFixture()
  h.state.visibleAfter = 2
  await confirmBootstrapRegistry(h.report, h.options)
  expect(h.state.versionRequests).toBe(3)
  expect(h.sleep).toHaveBeenCalledTimes(2)
  expect(h.report.accepted).toBe(true)
  expect(h.report.confirmed).toBe(true)
  expect(h.report.provenance?.url).toBe(attestationUrl(h.manifest))
  expect(h.report.error).toBe('Original registry confirmation did not complete')
  expect(h.spawn).not.toHaveBeenCalled()
  expect(h.oidc).not.toHaveBeenCalled()
})

it.each(['latest', 'legacy-1'])('rejects drift of the existing stable tag %s', async (tag) => {
  const h = registryFixture()
  h.state.tags[tag] = h.manifest.package.version
  await expect(confirmBootstrapRegistry(h.report, h.options)).rejects.toThrow(/tag|publication/u)
  expect(h.report.accepted).toBe(true)
  expect(h.report.confirmed).toBe(false)
  expect(h.spawn).not.toHaveBeenCalled()
})

it('rejects a preview channel changed by a concurrent publication', async () => {
  const h = registryFixture()
  h.state.tags['alpha'] = '0.1.0-alpha.99'
  await expect(confirmBootstrapRegistry(h.report, h.options)).rejects.toThrow('target tag changed concurrently')
  expect(h.spawn).not.toHaveBeenCalled()
})

it.each([undefined, '0.0.0-stage'])('records the first real publication latest promotion from %s separately', async (placeholder) => {
  const h = registryFixture()
  const before = placeholder === undefined ? {} : { latest: placeholder }
  h.state.tags = { latest: h.manifest.package.version, alpha: h.manifest.package.version }
  h.state.versions = ['0.0.0-stage', h.manifest.package.version]
  await expect(assertBootstrapTags(h.manifest, before, h.options, true)).resolves.toEqual({ before: placeholder ?? null, after: h.manifest.package.version, bootstrapPromoted: true })
})

it('does not treat a historical real version as an initialization placeholder', async () => {
  const h = registryFixture()
  h.state.tags = { latest: h.manifest.package.version, alpha: h.manifest.package.version }
  h.state.versions = ['0.0.0-stage', '0.0.9', h.manifest.package.version]
  await expect(assertBootstrapTags(h.manifest, { latest: '0.0.0-stage' }, h.options, true)).rejects.toThrow('latest tag')
})

it('does not permit initialization tag promotion before an upload was accepted', async () => {
  const h = registryFixture()
  h.state.tags = { latest: h.manifest.package.version, alpha: h.manifest.package.version }
  h.state.versions = ['0.0.0-stage', h.manifest.package.version]
  await expect(assertBootstrapTags(h.manifest, { latest: '0.0.0-stage' }, h.options)).rejects.toThrow('latest tag')
})

it('rejects a registry version with substituted bytes without retrying publication', async () => {
  const h = registryFixture()
  h.state.integrity = `sha512-${'A'.repeat(86)}==`
  await expect(confirmBootstrapRegistry(h.report, h.options)).rejects.toThrow('integrity differs')
  expect(h.report.confirmed).toBe(false)
  expect(h.sleep).not.toHaveBeenCalled()
  expect(h.spawn).not.toHaveBeenCalled()
})

it('rejects another workflow publishing identical bytes instead of claiming this trusted publisher was validated', async () => {
  const h = registryFixture()
  h.state.statement.predicate.buildDefinition.externalParameters.workflow.path = '.github/workflows/other-publisher.yml'
  await expect(confirmBootstrapRegistry(h.report, h.options)).rejects.toThrow()
  expect(h.report.confirmed).toBe(false)
  expect(h.spawn).not.toHaveBeenCalled()
})

it('preserves accepted-upload evidence when propagation never completes', async () => {
  const h = registryFixture()
  h.state.visibleAfter = Number.MAX_SAFE_INTEGER
  await expect(confirmBootstrapRegistry(h.report, h.options)).rejects.toThrow('verify-run-id without publishing again')
  expect(h.report.accepted).toBe(true)
  expect(h.report.confirmed).toBe(false)
  expect(h.state.versionRequests).toBeLessThanOrEqual(100)
  expect(h.spawn).not.toHaveBeenCalled()
  expect(h.oidc).not.toHaveBeenCalled()
})

it('treats unavailable registry state as unknown instead of an empty tag baseline', async () => {
  const h = boundaryFixture()
  const fetcher = vi.fn(async () => jsonResponse({ error: 'Unavailable' }, 503))
  await expect(bootstrapTags(h.manifest.package.name, { ...h.options, registryFetch: fetcher })).rejects.toThrow('HTTP 503')
})
