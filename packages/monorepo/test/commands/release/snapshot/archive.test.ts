import { Buffer } from 'node:buffer'
import { createSnapshotPlan } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { readSnapshotArchive, writeSnapshotArchive } from '../../../../src/commands/release/snapshot/archive'
import { finalizeSnapshotTarball } from '../../../../src/commands/release/snapshot/archive/finalize'
import { snapshotMetadata } from '../../../../src/commands/release/snapshot/identity'
import { fixture } from './fixture'

it.each(['package//package.json', 'package/./package.json', 'package/../package.json'])('rejects the noncanonical tarball path %s', async (path) => {
  const bytes = writeSnapshotArchive([{ path, mode: 0o644, type: 'File', data: Buffer.from('{}') }])
  await expect(readSnapshotArchive(bytes)).rejects.toThrow('unsupported or duplicate entry')
})

it('finalizes alias, optional and peer locators without changing packed file bytes or executable modes', async () => {
  const h = await fixture()
  const report = await createSnapshotPlan(h.options)
  const a = report.packages.find(pkg => pkg.name === 'snapshot-a')!
  const b = report.packages.find(pkg => pkg.name === 'snapshot-b')!
  const manifest = {
    name: b.name,
    version: b.version,
    repoctlSnapshot: snapshotMetadata(report),
    publishConfig: { tag: report.tag, registry: report.registry },
    dependencies: { alias: `npm:${a.name}@${a.version}` },
    optionalDependencies: { [a.name]: `^${a.version}` },
    devDependencies: { [a.name]: a.version },
    peerDependencies: { [a.name]: `^${a.version}` },
    peerDependenciesMeta: { [a.name]: { optional: true } },
  }
  const longPath = `package/${'segment/'.repeat(35)}binary.dat`
  const entries = [
    { path: 'package/package.json', mode: 0o644, type: 'File' as const, data: Buffer.from(JSON.stringify(manifest)) },
    { path: 'package/bin/tool.js', mode: 0o755, type: 'File' as const, data: Buffer.from('#!/usr/bin/env node\nconsole.log(42)\n') },
    { path: longPath, mode: 0o640, type: 'File' as const, data: Buffer.from([0, 255, 1, 128]) },
  ]
  const source = writeSnapshotArchive(entries)
  const references = new Map([[b.name, new Map([['dependencies.alias', a.name]])]])
  const finalized = await finalizeSnapshotTarball(source, b, report, { provider: 'pkg-pr-new', repository: 'acme/repo' }, references)
  expect((await finalizeSnapshotTarball(source, b, report, { provider: 'pkg-pr-new', repository: 'acme/repo' }, references)).bytes).toEqual(finalized.bytes)
  const packed = await readSnapshotArchive(finalized.bytes)
  for (const original of entries.slice(1)) {
    expect(packed.find(entry => entry.path === original.path)).toEqual(original)
  }
  const published = JSON.parse(packed.find(entry => entry.path === 'package/package.json')!.data.toString())
  const url = `https://pkg.pr.new/acme/repo/${a.name}@${report.identity.commit}`
  expect(published.dependencies.alias).toBe(url)
  expect(published.optionalDependencies[a.name]).toBe(url)
  expect(published.devDependencies[a.name]).toBe(url)
  expect(published.peerDependencies[a.name]).toBe(a.version)
  expect(published.peerDependenciesMeta).toEqual(manifest.peerDependenciesMeta)
  expect(finalized.expected.get('dependencies.alias')).toEqual({ name: a.name, locator: url })
  const npm = await finalizeSnapshotTarball(source, b, report, { provider: 'npm', repository: '' }, references)
  const npmManifest = JSON.parse((await readSnapshotArchive(npm.bytes)).find(entry => entry.path === 'package/package.json')!.data.toString())
  expect(npmManifest.dependencies.alias).toBe(`npm:${a.name}@${a.version}`)
  expect(npmManifest.optionalDependencies[a.name]).toBe(a.version)
})

it('rejects pack hooks changing a snapshot identity or introducing an arbitrary workspace URL', async () => {
  const h = await fixture()
  const report = await createSnapshotPlan(h.options)
  const a = report.packages[0]!
  const b = report.packages[1]!
  const manifest = { name: b.name, version: b.version, repoctlSnapshot: snapshotMetadata(report), publishConfig: { tag: report.tag, registry: report.registry }, dependencies: { [a.name]: a.version } }
  const pack = (value: object) => writeSnapshotArchive([{ path: 'package/package.json', mode: 0o644, type: 'File', data: Buffer.from(JSON.stringify(value)) }])
  await expect(finalizeSnapshotTarball(pack({ ...manifest, version: '9.9.9' }), b, report, { provider: 'npm', repository: '' }, new Map())).rejects.toThrow('Packed snapshot identity')
  await expect(finalizeSnapshotTarball(pack({ ...manifest, dependencies: { [a.name]: 'https://example.invalid/other.tgz' } }), b, report, { provider: 'pkg-pr-new', repository: 'acme/repo' }, new Map())).rejects.toThrow('dependency changed')
  await expect(finalizeSnapshotTarball(pack({ ...manifest, dependencies: {} }), b, report, { provider: 'pkg-pr-new', repository: 'acme/repo' }, new Map([[b.name, new Map([[`dependencies.${a.name}`, a.name]])]]))).rejects.toThrow('dependency was removed')
})
