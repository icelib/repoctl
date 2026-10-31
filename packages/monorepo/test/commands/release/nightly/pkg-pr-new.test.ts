import type { NightlyOptions } from '@icebreakers/monorepo'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import crossSpawn from 'cross-spawn'
import { expect, it, vi } from 'vitest'
import { nightlyContext } from '../../../../src/commands/release/nightly/context'
import { publishPkgPrNew } from '../../../../src/commands/release/nightly/providers/pkg-pr-new'
import { downloadPkgPrNew, inspectPkgPrNew } from '../../../../src/commands/release/nightly/providers/pkg-pr-new/registry'
import { fixture } from './fixture'
import { pkgPrFixture } from './provider-fixture'

async function publisherFixture() {
  const h = await pkgPrFixture()
  const published = new Map<string, Uint8Array<ArrayBuffer>>()
  const calls: string[][] = []
  const registryFetch = vi.fn<typeof fetch>(async (input) => {
    const pkg = h.report.packages.find(item => item.locator === String(input))!
    return published.has(pkg.name) ? new Response(published.get(pkg.name)!) : new Response('missing', { status: 404 })
  })
  const spawn: NonNullable<NightlyOptions['spawn']> = ((command, args, options) => {
    const parameters = args as string[]
    expect(command).toBe(process.execPath)
    expect(parameters[0]).toContain('pkg-pr-new')
    expect(parameters[0]).toMatch(/bin[/\\]cli\.js$/)
    expect(options?.cwd).toBe(path.join(h.root, 'pkg-pr-new-publication'))
    expect(options?.timeout).toBe(600_000)
    expect(options?.env?.['GIT_DIR']).toBeUndefined()
    expect(options?.env?.['GIT_WORK_TREE']).toBeUndefined()
    expect(options?.env?.['GIT_CEILING_DIRECTORIES']).toBe(h.root)
    calls.push(parameters)
    const uploaded = parameters.filter(value => value.endsWith('.tgz')).map((filename) => {
      const pkg = h.report.snapshot!.packages.find(item => item.tarball === filename)!
      const bytes = Uint8Array.from(readFileSync(filename))
      published.set(pkg.name, bytes)
      return { name: pkg.name, url: h.report.packages.find(item => item.name === pkg.name)!.locator, shasum: createHash('sha1').update(bytes).digest('hex') }
    })
    writeFileSync(parameters[parameters.indexOf('--json') + 1]!, JSON.stringify({ packages: uploaded, templates: [] }))
    return { pid: 1, output: [null, '', ''], stdout: '', stderr: '', status: 0, signal: null }
  }) as NonNullable<NightlyOptions['spawn']>
  const options = { ...h.options, spawn, registryFetch }
  return { ...h, options, published, calls }
}

it('derives a deterministic pkg.pr.new identity from repository and full commit, independent of reruns', async () => {
  const h = await fixture()
  const first = await nightlyContext(h.options, { provider: 'pkg-pr-new' })
  const next = await nightlyContext({ ...h.options, env: { ...h.env, GITHUB_RUN_ID: '999', GITHUB_RUN_ATTEMPT: '3' } }, { provider: 'pkg-pr-new' })
  expect(first.identity).toEqual(next.identity)
  const moved = await nightlyContext({ ...h.options, env: { ...h.env, GITHUB_SHA: 'b'.repeat(40) } }, { provider: 'pkg-pr-new' })
  expect(moved.identity.buildId).not.toBe(first.identity.buildId)
})

it.each([
  { label: 'default quality settings', qualityTimeoutMs: undefined },
  { label: 'a custom quality timeout', qualityTimeoutMs: 123_456 },
])('uploads the whole missing batch once with the original upload budget under $label and verifies downloaded bytes', async ({ qualityTimeoutMs }) => {
  const h = await publisherFixture()
  const options = { ...h.options, config: { nightly: qualityTimeoutMs === undefined ? {} : { qualityTimeoutMs } } }
  expect(await inspectPkgPrNew(h.report, options)).toBe(false)
  const checkpoint = vi.fn(async () => {})
  await publishPkgPrNew(h.report, options, checkpoint)
  expect(h.calls).toHaveLength(1)
  expect(h.calls[0]).toEqual(expect.arrayContaining(['publish', '--no-compact', '--comment=off', '--no-template', '--json', ...h.report.snapshot!.packages.map(pkg => pkg.tarball!)]))
  expect(h.report.confirmed).toBe(true)
  expect(h.report.snapshot!.packages.every(pkg => pkg.published)).toBe(true)
  expect(checkpoint).toHaveBeenCalled()
  expect(await inspectPkgPrNew(h.report, h.options)).toBe(true)
})

it('recovers partial publication by comparing occupied bytes and uploading only missing packages', async () => {
  const h = await publisherFixture()
  h.published.set('@scope/a', h.artifacts.get('@scope/a')!)
  expect(await inspectPkgPrNew(h.report, h.options)).toBe(false)
  await publishPkgPrNew(h.report, h.options, async () => {})
  expect(h.calls).toHaveLength(1)
  expect(h.calls[0]).not.toContain(h.report.snapshot!.packages[0]!.tarball)
  expect(h.calls[0]).toContain(h.report.snapshot!.packages[1]!.tarball)
  expect(h.report.confirmed).toBe(true)
})

it('prevents the uploader from discovering an unrelated parent Git repository or inherited Git worktree', async () => {
  const h = await publisherFixture()
  expect(crossSpawn.sync('git', ['init', '-q', h.root], { encoding: 'utf8' }).status).toBe(0)
  expect(crossSpawn.sync('git', ['-C', h.root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', `core.hooksPath=${path.join(h.root, 'no-hooks')}`, 'commit', '--allow-empty', '-qm', 'unrelated repository'], { encoding: 'utf8' }).status).toBe(0)
  const original = h.options.spawn
  const spawn: NonNullable<NightlyOptions['spawn']> = ((command, args, settings) => {
    const git = crossSpawn.sync('git', ['rev-parse', 'HEAD'], { cwd: settings!.cwd, env: settings!.env, encoding: 'utf8' })
    expect(git.status).not.toBe(0)
    return original(command, args, settings)
  }) as NonNullable<NightlyOptions['spawn']>
  await publishPkgPrNew(h.report, { ...h.options, spawn, env: { ...h.options.env, GIT_DIR: path.join(h.root, '.git'), GIT_WORK_TREE: h.root } }, async () => {})
  expect(h.report.confirmed).toBe(true)
})

it('does not upload again when every occupied commit URL already matches prepared bytes', async () => {
  const h = await publisherFixture()
  for (const [name, bytes] of h.artifacts) {
    h.published.set(name, bytes)
  }
  expect(await inspectPkgPrNew(h.report, h.options)).toBe(true)
  await publishPkgPrNew(h.report, h.options, async () => {})
  expect(h.calls).toEqual([])
  expect(h.report.confirmed).toBe(true)
})

it('rejects occupied content with matching metadata but different bytes before any missing upload', async () => {
  const h = await publisherFixture()
  await writeFile(path.join(h.root, 'package-0/package/changed.txt'), 'different build output')
  const filename = path.join(h.root, 'changed.tgz')
  const packed = crossSpawn.sync('tar', ['--format=ustar', '-czf', filename, '-C', path.join(h.root, 'package-0'), 'package'], { encoding: 'utf8' })
  expect(packed.status, packed.stderr).toBe(0)
  h.published.set('@scope/a', Uint8Array.from(await readFile(filename)))
  await expect(publishPkgPrNew(h.report, h.options, async () => {})).rejects.toThrow('bytes conflict')
  expect(h.calls).toEqual([])
})

it('fails closed on query errors or foreign identity at a preview URL', async () => {
  const h = await publisherFixture()
  const pkg = h.report.packages[0]!
  await expect(downloadPkgPrNew(pkg, h.report, { ...h.options, registryFetch: vi.fn(async () => new Response('forbidden', { status: 403 })) })).rejects.toThrow('publication state is unknown')
  await expect(downloadPkgPrNew(pkg, h.report, { ...h.options, registryFetch: vi.fn(async () => {
    throw new Error('private transport details')
  }) })).rejects.toThrow('publication state is unknown')
  h.published.set('@scope/a', h.artifacts.get('b')!)
  await expect(inspectPkgPrNew(h.report, h.options)).rejects.toThrow('artifact identity conflicts')
  expect(h.calls).toEqual([])
})

it('rejects remote bytes that change after a successful upload without declaring publication confirmed', async () => {
  const h = await publisherFixture()
  await writeFile(path.join(h.root, 'package-0/package/server-change.txt'), 'server returned different bytes')
  const filename = path.join(h.root, 'server-change.tgz')
  expect(crossSpawn.sync('tar', ['--format=ustar', '-czf', filename, '-C', path.join(h.root, 'package-0'), 'package'], { encoding: 'utf8' }).status).toBe(0)
  const changed = Uint8Array.from(await readFile(filename))
  const registryFetch = vi.fn<typeof fetch>(async (input, init) => String(input) === h.report.packages[0]!.locator && h.published.has('@scope/a') ? new Response(changed) : h.options.registryFetch(input, init))
  await expect(publishPkgPrNew(h.report, { ...h.options, registryFetch }, async () => {})).rejects.toThrow('downloaded bytes differ')
  expect(h.calls).toHaveLength(1)
  expect(h.report.confirmed).toBeUndefined()
})

it('rejects misleading uploader JSON and never confirms it as successful publication', async () => {
  const h = await publisherFixture()
  const original = h.options.spawn
  const spawn: NonNullable<NightlyOptions['spawn']> = ((command, args, options) => {
    const result = original(command, args, options)
    const parameters = args as string[]
    const filename = parameters[parameters.indexOf('--json') + 1]!
    const uploaded = JSON.parse(readFileSync(filename, 'utf8'))
    uploaded.packages[0].url = 'https://pkg.pr.new/wrong/repo/other@main'
    writeFileSync(filename, JSON.stringify(uploaded))
    return result
  }) as NonNullable<NightlyOptions['spawn']>
  await expect(publishPkgPrNew(h.report, { ...h.options, spawn }, async () => {})).rejects.toThrow('JSON conflicts')
  expect(h.calls).toHaveLength(1)
  expect(h.report.confirmed).toBeUndefined()
})
