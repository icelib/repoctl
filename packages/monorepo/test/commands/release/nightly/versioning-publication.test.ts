import type { NightlyOptions } from '@icebreakers/monorepo'
import { readFile } from 'node:fs/promises'
import { createPackageFromTarballData } from '@arethetypeswrong/core'
import { releaseNightly } from '@icebreakers/monorepo'
import { afterEach, expect, it, vi } from 'vitest'
import { publishSnapshotArtifacts } from '../../../../src/commands/release/snapshot/publish'
import { completed } from './consumer/fixture'
import { fixture, json } from './fixture'

afterEach(() => vi.useRealTimers())

it('keeps the planned UTC date in real tarballs and internal dependencies when quality checks cross midnight', async () => {
  const h = await fixture()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-11T23:59:59Z'))
  const original = h.options.spawn!
  const spawn: NonNullable<NightlyOptions['spawn']> = ((command, args, settings) => {
    const result = original(command, args, settings)
    if (command === 'pnpm' && args?.[0] === 'run' && args[1] === 'build' && settings?.cwd === h.cwd) {
      vi.setSystemTime(new Date('2026-11-12T00:01:00Z'))
    }
    return result
  }) as NonNullable<NightlyOptions['spawn']>
  const report = await releaseNightly({ ...h.options, spawn })
  expect(report.status, report.error).toBe('prepared')
  expect(new Date().toISOString()).toBe('2026-11-12T00:01:00.000Z')
  expect(report.packages.map(pkg => pkg.version)).toEqual(['1.0.1-dev.20261111.1', '1.0.0-dev.20261111.1'])
  for (const pkg of report.snapshot!.packages) {
    const packed = createPackageFromTarballData(Uint8Array.from(await readFile(pkg.tarball!)))
    const manifest = JSON.parse(packed.readFile(`/node_modules/${pkg.name}/package.json`))
    expect(manifest).toMatchObject({ name: pkg.name, version: pkg.version, repoctlSnapshot: { ...report.snapshot!.identity, identityKey: report.snapshot!.identityKey, tag: 'snapshot-nightly' } })
    if (pkg.name === 'snapshot-b') {
      expect(manifest.dependencies['snapshot-a']).toBe('1.0.1-dev.20261111.1')
    }
  }
  expect(h.uploads).toEqual([])
  expect(h.run('git', ['status', '--porcelain'])).toBe('')
}, 120_000)

it.each(['identity', 'integrity'])('stops all uploads when a date version acquires conflicting %s after preparation', async (conflict) => {
  const h = await fixture()
  const report = await releaseNightly(h.options)
  expect(report.status, report.error).toBe('prepared')
  const snapshot = report.snapshot!
  const versions = snapshot.packages.map(pkg => pkg.version)
  const pkg = snapshot.packages[1]!
  const metadata = {
    name: pkg.name,
    version: pkg.version,
    repoctlSnapshot: { ...snapshot.identity, identityKey: conflict === 'identity' ? 'b'.repeat(64) : snapshot.identityKey, tag: snapshot.tag },
    dist: { integrity: conflict === 'integrity' ? `sha512-${'A'.repeat(86)}==` : pkg.integrity },
  }
  const registryFetch = vi.fn<typeof fetch>(async input => new URL(String(input)).pathname === `/${pkg.name}/${pkg.version}` ? json(metadata) : json({}, 404))
  const original = h.options.spawn!
  const spawn: NonNullable<NightlyOptions['spawn']> = ((command, args, settings) => {
    if (command === 'npm' && args?.[0] === 'view') {
      return args[1] === `${pkg.name}@${pkg.version}` ? { ...completed('', 0), stdout: JSON.stringify(metadata) } : completed('E404 Not Found')
    }
    return original(command, args, settings)
  }) as NonNullable<NightlyOptions['spawn']>
  await expect(publishSnapshotArtifacts(snapshot, { ...h.options, identity: snapshot.identity, registryFetch, spawn }, async () => {})).rejects.toThrow('identity or tarball integrity already conflicts')
  expect(snapshot.packages.map(pkg => pkg.version)).toEqual(versions)
  expect(h.uploads).toEqual([])
  expect(snapshot.packages.every(pkg => !pkg.published)).toBe(true)
}, 120_000)
