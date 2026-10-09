import { mkdir, writeFile } from 'node:fs/promises'
import { publishStable, releaseCi } from '@icebreakers/monorepo'
import path from 'pathe'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanupReleaseTempRoots } from '../release-fixtures'
import { a, b, publishHarness } from './publish-fixtures'
import { recoveryRemote, recoveryRunner, source } from './recovery-fixtures'

afterEach(cleanupReleaseTempRoots)

async function publicEnvironment(cwd: string) {
  const file = path.join(cwd, 'empty-npmrc')
  await writeFile(file, '')
  await writeFile(`${file}-global`, '')
  return { HOME: cwd, npm_config_userconfig: file, npm_config_globalconfig: `${file}-global`, npm_config_registry: 'https://registry.npmjs.org' }
}

it('uses HTTP for official public versions and enforces concurrency four', async () => {
  const packages = [a, b, ...Array.from({ length: 4 }, (_, index) => ({ name: `public-${index}`, version: '1.0.0' }))]
  const h = await publishHarness([{ status: 0, summary: packages }])
  for (const pkg of packages.slice(2)) {
    const directory = path.join(h.cwd, 'packages', pkg.name)
    await mkdir(directory)
    await writeFile(path.join(directory, 'package.json'), JSON.stringify(pkg))
  }
  let active = 0
  let maximum = 0
  const fetch = vi.fn(async () => {
    maximum = Math.max(maximum, ++active)
    await new Promise(resolve => setTimeout(resolve, 5))
    active--
    return Response.json({ version: '1.0.0' })
  })
  await publishStable({ ...h.options, env: await publicEnvironment(h.cwd), registryFetch: fetch })
  expect(maximum).toBe(4)
  expect(fetch).toHaveBeenCalledTimes(6)
  expect(h.calls.some(call => call.command === 'npm')).toBe(false)
})

it('waits for delayed dist-tags without uploading accepted versions again', async () => {
  const remote = recoveryRemote()
  const h = await recoveryRunner(remote)
  let elapsed = 0
  let versionQueries = 0
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('/dist-tags')) {
      return Response.json(elapsed >= 4_000 ? { latest: '1.0.0' } : {})
    }
    versionQueries++
    return remote.versions.size ? Response.json({ version: '1.0.0', gitHead: source }) : new Response('', { status: 404 })
  })
  await releaseCi({ ...h.options, registryFetch: fetch, env: { ...h.options.env, ...await publicEnvironment(h.cwd) }, sleep: async (ms) => {
    elapsed += ms
  } })
  expect(elapsed).toBe(4_000)
  expect(versionQueries).toBe(4) // preflight 404s plus positive versions; tag polling reuses them
  expect(h.uploads()).toHaveLength(1)
  expect(remote.state()?.complete).toBe(true)
})

it.each([401, 403])('fails explicitly on HTTP %s and preserves accepted progress', async (status) => {
  const h = await publishHarness([{ status: 0, summary: [a, b] }])
  await expect(publishStable({ ...h.options, env: await publicEnvironment(h.cwd), registryFetch: async () => new Response('', { status }) })).rejects.toThrow('authentication failed')
  expect(h.uploads()).toHaveLength(1)
  expect(await h.report()).toMatchObject({ status: 'failed', acceptedPackages: [a, b] })
})

it.each([429, 503])('retries HTTP %s within bounded attempts', async (status) => {
  const h = await publishHarness([{ status: 0, summary: [a, b] }])
  let requests = 0
  await publishStable({ ...h.options, env: await publicEnvironment(h.cwd), registryFetch: async () => ++requests <= 2 ? new Response('', { status }) : Response.json({ version: '1.0.0' }) })
  expect(requests).toBe(4)
  expect(h.uploads()).toHaveLength(1)
})

it('bounds a hung request and reports its cause after three attempts', async () => {
  const h = await publishHarness([{ status: 0, summary: [a, b] }])
  const fetch = vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('timeout')), { once: true })
  }))
  await expect(publishStable({ ...h.options, env: await publicEnvironment(h.cwd), registryFetch: fetch, config: { ...h.options.config, registry: { requestTimeoutMs: 10, visibilityTimeoutMs: 10_000 } } })).rejects.toThrow('registry state is unknown')
  expect(fetch).toHaveBeenCalledTimes(6)
  expect(h.uploads()).toHaveLength(1)
})

it.each(['custom', 'authenticated'])('preserves npm CLI for %s configuration', async (kind) => {
  const h = await publishHarness([{ status: 0, summary: [a, b] }])
  const env = await publicEnvironment(h.cwd)
  if (kind === 'custom') {
    env.npm_config_registry = 'https://registry.example.test'
  }
  await writeFile(env.npm_config_userconfig, kind === 'custom' ? '@scope:registry=https://registry.example.test\nregistry=https://registry.example.test\n' : '//registry.npmjs.org/:_authToken=test-only\n')
  const fetch = vi.fn(async () => Response.json({ version: '1.0.0' }))
  await publishStable({ ...h.options, env, registryFetch: fetch })
  expect(fetch).not.toHaveBeenCalled()
  expect(h.calls.filter(call => call.command === 'npm')).toHaveLength(2)
})

it('keeps positive confirmations monotonic across later 404 responses', async () => {
  const h = await publishHarness([{ status: 0, summary: [a, b] }])
  const queried: string[] = []
  let elapsed = 0
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    queried.push(url)
    return url.includes('repoctl/') || elapsed >= 4_000 ? Response.json({ version: '1.0.0' }) : new Response('', { status: 404 })
  })
  await publishStable({ ...h.options, env: await publicEnvironment(h.cwd), registryFetch: fetch, sleep: async (ms) => {
    elapsed += ms
  } })
  expect(queried.filter(url => url.includes('repoctl/'))).toHaveLength(1)
  expect(h.uploads()).toHaveLength(1)
})
