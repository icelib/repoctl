import type { NightlyOptions } from '@icebreakers/monorepo'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { expect, it, vi } from 'vitest'
import { publishPkgPrNew } from '../../../../src/commands/release/nightly/providers/pkg-pr-new'
import { pkgPrFixture } from './provider-fixture'

it('uploads and confirms prepared pkg.pr.new artifacts with an independent timeout after the quality deadline expires', async () => {
  const h = await pkgPrFixture()
  const published = new Map<string, Uint8Array<ArrayBuffer>>()
  const deadline = String(Math.floor(Date.now() / 1000) - 1)
  const registryFetch = vi.fn<typeof fetch>(async (input) => {
    const pkg = h.report.packages.find(item => item.locator === String(input))!
    return published.has(pkg.name) ? new Response(published.get(pkg.name)!) : new Response('missing', { status: 404 })
  })
  const upload = vi.fn((command: string, args: readonly string[], options: { timeout?: number, env?: NodeJS.ProcessEnv }) => {
    expect(command).toBe(process.execPath)
    expect(args).toContain('publish')
    expect(options.timeout).toBe(600_000)
    expect(options.env?.['REPOCTL_NIGHTLY_QUALITY_DEADLINE_EPOCH']).toBe(deadline)
    const packages = args.filter(value => value.endsWith('.tgz')).map((filename) => {
      const pkg = h.report.snapshot!.packages.find(item => item.tarball === filename)!
      const bytes = Uint8Array.from(readFileSync(filename))
      published.set(pkg.name, bytes)
      return {
        name: pkg.name,
        url: h.report.packages.find(item => item.name === pkg.name)!.locator,
        shasum: createHash('sha1').update(bytes).digest('hex'),
      }
    })
    writeFileSync(args[args.indexOf('--json') + 1]!, JSON.stringify({ packages, templates: [] }))
    return { pid: 1, output: [null, 'uploaded\n', ''], stdout: 'uploaded\n', stderr: '', status: 0, signal: null }
  })
  await publishPkgPrNew(h.report, {
    ...h.options,
    env: { ...h.options.env, REPOCTL_NIGHTLY_QUALITY_DEADLINE_EPOCH: deadline },
    registryFetch,
    spawn: upload as unknown as NonNullable<NightlyOptions['spawn']>,
  }, async () => {})
  expect(upload).toHaveBeenCalledTimes(1)
  expect(h.report.commands).toEqual([expect.objectContaining({ exitCode: 0, stdout: 'uploaded\n' })])
  expect(h.report.confirmed).toBe(true)
  expect(h.report.snapshot?.packages.every(pkg => pkg.published)).toBe(true)
})
