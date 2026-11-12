import type { NightlyOptions } from '@icebreakers/monorepo'
import { Buffer } from 'node:buffer'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
import { verifyNightlyConsumer } from '../../../../../src/commands/release/nightly/consumer'
import { writeSnapshotArchive } from '../../../../../src/commands/release/snapshot/archive'
import { consumerRegistry, freshPeer } from '../../consumer/registry'
import { consumerFixture } from './fixture'

it.each([false, true])('installs fresh external peers in the real nightly consumer (legacy JSON: %s)', async (legacy) => {
  const h = await consumerFixture({ manifest: {
    peerDependencies: { [freshPeer.name]: freshPeer.version },
    peerDependenciesMeta: { [freshPeer.name]: { optional: true } },
  } })
  const root = JSON.parse(await readFile(new URL('../../../../../../../package.json', import.meta.url), 'utf8')) as { packageManager: string }
  await writeFile(path.join(h.root, 'package.json'), JSON.stringify({ packageManager: root.packageManager }))
  const tarballs = await Promise.all(h.report.snapshot!.packages.map(pkg => readFile(pkg.tarball!)))
  const manifests = await Promise.all(h.report.packages.map((_pkg, index) => readFile(path.join(h.root, `archive-${index}/package/package.json`), 'utf8').then(value => JSON.parse(value) as { name: string, version: string })))
  const peerTarball = writeSnapshotArchive([
    { path: 'package/package.json', mode: 0o644, type: 'File', data: Buffer.from(JSON.stringify(freshPeer)) },
    { path: 'package/index.js', mode: 0o644, type: 'File', data: Buffer.from('export const peer = true') },
  ])
  const registry = await consumerRegistry([...manifests, freshPeer], [...tarballs, peerTarball], legacy)
  try {
    const verification = verifyNightlyConsumer(h.report, { ...h.options, spawn: registry.spawn as NonNullable<NightlyOptions['spawn']> })
    if (legacy) {
      await expect(verification).rejects.toThrow('ERR_PNPM_WORKSPACE_MANIFEST_WRITER_UNSUPPORTED_INLINE_BLOCK')
      expect(h.report.consumer?.status).toBe('failed')
      return
    }
    await verification
    expect(h.report.consumer?.status).toBe('verified')
    expect(h.report.consumer?.packages).toHaveLength(2)
    expect(registry.policies[0]?.['minimumReleaseAgeExclude']).toEqual(expect.arrayContaining([
      ...h.report.packages.map(pkg => `${pkg.name}@${pkg.version}`),
      `${freshPeer.name}@${freshPeer.version}`,
    ]))
    expect(registry.policies[0]).not.toHaveProperty('minimumReleaseAge')
  }
  finally {
    await registry.close()
  }
}, 120_000)
