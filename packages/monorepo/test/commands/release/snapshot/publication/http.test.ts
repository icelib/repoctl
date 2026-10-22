import { performance } from 'node:perf_hooks'
import { expect, it, vi } from 'vitest'
import { registryClient } from '../../../../../src/commands/release/registry'
import { publishSnapshotArtifacts } from '../../../../../src/commands/release/snapshot/publish'
import { registryPresence } from '../../../../../src/commands/release/snapshot/publish/registry'
import { publicationFixture } from './fixture'

it('uses the same public HTTP manifest for upload version confirmation and snapshot identity checks', async () => {
  const h = await publicationFixture()
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    const pkg = h.report.packages.find(item => url.pathname === `/${item.name}/${item.version}`)!
    expect(pkg).toBeDefined()
    return h.uploaded.has(pkg.name) ? Response.json(h.metadata(pkg)) : new Response('', { status: 404 })
  })
  await publishSnapshotArtifacts(h.report, { ...h.options, registryFetch: fetch }, async () => {})
  expect(h.report.status).toBe('published')
  expect(h.uploads).toEqual(['first', 'second'])
  expect(fetch).toHaveBeenCalledTimes(4) // Two absent preflights, then one complete manifest per uploaded version.
  expect(h.spawn.mock.calls.every(([command]) => command === 'pnpm')).toBe(true)
})

it('shares positive immutable HTTP evidence with the default public transport', async () => {
  const h = await publicationFixture()
  const pkg = h.report.packages[0]!
  const fetch = vi.fn(async () => Response.json(h.metadata(pkg)))
  vi.stubGlobal('fetch', fetch)
  const { spawn: _spawn, ...options } = h.options
  await expect(registryClient(options).inspect(pkg, performance.now() + 1_000, 'version')).resolves.toMatchObject(h.metadata(pkg))
  fetch.mockImplementation(async () => new Response('', { status: 404 }))
  await expect(registryPresence(pkg, h.report, options)).resolves.toBe(true)
  expect(fetch).toHaveBeenCalledTimes(1)
})
