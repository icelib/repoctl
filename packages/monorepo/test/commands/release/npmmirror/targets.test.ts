import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { syncNpmMirror } from '../../../../src/commands/release/npmmirror'
import { clearWorkspaceCache } from '../../../../src/core/workspace'
import { harness } from './fixture'

const roots: string[] = []
afterEach(async () => {
  clearWorkspaceCache()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function workspace() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'npmmirror-targets-'))
  roots.push(cwd)
  await writeFile(path.join(cwd, 'package.json'), JSON.stringify({ name: 'private-root', private: true }))
  await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
  for (const [name, fields] of [['public-pkg', {}], ['private-pkg', { private: true }], ['internal-pkg', { publishConfig: { registry: 'https://internal.example' } }]] as const) {
    const dir = path.join(cwd, 'packages', name)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name, version: '9.0.0', ...fields }))
  }
  return cwd
}

describe('npmmirror target selection', () => {
  it.each([
    {},
    { all: true, published: true },
    { all: true, packageName: 'repoctl' },
    { all: true, version: '1.0.0' },
    { packageName: '../repoctl' },
    { packageName: 'repoctl', version: 'latest' },
    { packageName: 'repoctl', timeout: 0 },
    { packageName: 'repoctl', timeout: Number.NaN },
  ])('rejects invalid input before any request: %j', async (options) => {
    const h = harness()
    await expect(syncNpmMirror({ cwd: '.', ...options }, h.runtime)).rejects.toThrow()
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it('uses only public npm workspaces and resolves published tags instead of unreleased local versions', async () => {
    const h = harness()
    const result = await syncNpmMirror({ cwd: await workspace(), all: true, dryRun: true }, h.runtime)
    expect(result).toEqual([{ name: 'public-pkg', versions: ['1.0.0', '2.0.0-next.0'], state: 'dry-run' }])
    expect(h.fetch).toHaveBeenCalledOnce()
  })

  it('deduplicates names and versions from the release input, without scanning workspaces', async () => {
    const h = harness()
    const env = { REPO_RELEASE_PUBLISHED_PACKAGES: JSON.stringify([
      { name: '@scope/pkg', version: '1.0.0' },
      { name: '@scope/pkg', version: '1.0.0' },
      { name: '@scope/pkg', version: '2.0.0-next.0' },
    ]) }
    const result = await syncNpmMirror({ cwd: '.', published: true, env }, h.runtime)
    expect(result).toMatchObject([{ name: '@scope/pkg', versions: ['1.0.0', '2.0.0-next.0'], state: 'success' }])
    const puts = h.fetch.mock.calls.filter(([, init]) => init?.method === 'PUT')
    expect(puts).toHaveLength(1)
    expect(puts[0]?.[0]).toBe('https://registry-direct.npmmirror.com/-/package/%40scope%2Fpkg/syncs')
    expect(JSON.parse(String(puts[0]?.[1]?.body))).toEqual({ skipDependencies: true, specificVersions: '["1.0.0","2.0.0-next.0"]' })
  })

  it('honors an explicit empty list even when an old summary path is present', async () => {
    const h = harness()
    expect(await syncNpmMirror({ cwd: '.', published: true, env: {
      REPO_RELEASE_PUBLISHED_PACKAGES: '[]',
      REPO_RELEASE_PUBLISH_SUMMARY: 'old-summary.json',
    } }, h.runtime)).toEqual([])
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it.each([undefined, '{', '{}', '["repoctl"]', '[{"name":"repoctl"}]'])('rejects missing or damaged release input: %s', async (value) => {
    const h = harness()
    await expect(syncNpmMirror({ cwd: '.', published: true, env: { REPO_RELEASE_PUBLISHED_PACKAGES: value } }, h.runtime)).rejects.toThrow()
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it('reads the explicitly supplied pnpm publish summary', async () => {
    const cwd = await workspace()
    const summary = path.join(cwd, 'summary.json')
    await writeFile(summary, JSON.stringify({ publishedPackages: [{ name: 'repoctl', version: '1.0.0' }] }))
    const h = harness()
    expect(await syncNpmMirror({ cwd, published: true, dryRun: true, env: { REPO_RELEASE_PUBLISH_SUMMARY: summary } }, h.runtime))
      .toMatchObject([{ name: 'repoctl', versions: ['1.0.0'], state: 'dry-run' }])
  })

  it('skips unpublished workspace packages while reporting a sync endpoint 404 as failure', async () => {
    const cwd = await workspace()
    const unpublished = harness(() => Response.json({ error: 'not found' }, { status: 404 }))
    expect(await syncNpmMirror({ cwd, all: true }, unpublished.runtime)).toMatchObject([{ state: 'skipped' }])
    const missingEndpoint = harness(url => url.includes('/syncs')
      ? Response.json({ error: 'not found' }, { status: 404 })
      : Response.json({ 'versions': { '1.0.0': {} }, 'dist-tags': { latest: '1.0.0' } }))
    expect(await syncNpmMirror({ cwd, all: true }, missingEndpoint.runtime)).toMatchObject([{ state: 'failed' }])
  })
})
