import type { PreparedSnapshotConsumerOptions, PreparedSnapshotPublishReport } from '@icebreakers/monorepo'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { verifyPreparedSnapshotConsumer } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { writeSnapshotArchive } from '../../../../../src/commands/release/snapshot/archive'
import { consumerRegistry, freshPeer, withFreshPeer } from '../../consumer/registry'
import { bundle } from './fixture'

it.each([false, true])('consumes an editable pnpm workspace through the built snapshot API (legacy JSON: %s)', async (legacy) => {
  const rootManifest = JSON.parse(await readFile(new URL('../../../../../../../package.json', import.meta.url), 'utf8')) as { packageManager: string }
  const fixture = bundle(rootManifest.packageManager)
  const directory = await mkdtemp(path.join(tmpdir(), 'repoctl-snapshot-registry-consumer-'))
  const manifests = fixture.manifests.map(manifest => withFreshPeer({ ...manifest, type: 'module', exports: './index.js', scripts: { postinstall: 'node -e "throw new Error(\'Candidate install scripts must not run\')"' } }))
  const bodies = [
    'export const value = 42;',
    'import { value } from "alias"; if (value !== 42) throw new Error("Snapshot dependency closure failed"); if (process.env.GITHUB_TOKEN || process.env.NPM_TOKEN || process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN || process.env.NODE_OPTIONS) throw new Error("Consumer received credentials"); export { value };',
  ]
  const tarballs = manifests.map((manifest, index) => {
    const bytes = writeSnapshotArchive([
      { path: 'package/package.json', mode: 0o644, type: 'File', data: Buffer.from(JSON.stringify(manifest)) },
      { path: 'package/index.js', mode: 0o644, type: 'File', data: Buffer.from(bodies[index]!) },
    ])
    fixture.manifest.packages[index]!.integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
    return bytes
  })
  const peerTarball = writeSnapshotArchive([
    { path: 'package/package.json', mode: 0o644, type: 'File', data: Buffer.from(JSON.stringify(freshPeer)) },
    { path: 'package/index.js', mode: 0o644, type: 'File', data: Buffer.from('export const peer = true') },
  ])
  const registry = await consumerRegistry([...manifests, freshPeer], [...tarballs, peerTarball], legacy)
  try {
    const report: PreparedSnapshotPublishReport = {
      schemaVersion: 1,
      status: 'published',
      manifest: fixture.manifest,
      evidence: { source: fixture.plan.source, freezeJobId: 1, buildJobId: 2, planArtifact: { id: 3, digest: 'sha256:x' }, buildArtifact: { id: 4, digest: 'sha256:y' }, planDigest: fixture.manifest.planDigest },
      packages: fixture.manifest.packages.map(pkg => ({ name: pkg.name, version: pkg.version, integrity: pkg.integrity, published: true })),
      install: { executable: 'pnpm', args: [] },
      installCommand: '',
      outputDirectory: directory,
    }
    const result = await verifyPreparedSnapshotConsumer({ report, outputDirectory: directory, registryFetch: registry.fetcher, spawn: registry.spawn as NonNullable<PreparedSnapshotConsumerOptions['spawn']>, env: { ...process.env, GITHUB_TOKEN: 'github-secret', NPM_TOKEN: 'npm-secret', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'oidc-secret', NODE_OPTIONS: '--require=invalid-candidate-hook' } })
    if (legacy) {
      expect(result.status).toBe('failed')
      expect(result.error).toContain('ERR_PNPM_WORKSPACE_MANIFEST_WRITER_UNSUPPORTED_INLINE_BLOCK')
      return
    }
    expect(result.error).toBeUndefined()
    expect(registry.policies[0]?.['minimumReleaseAgeExclude']).toEqual(expect.arrayContaining([
      ...fixture.manifest.packages.map(pkg => `${pkg.name}@${pkg.version}`),
      `${freshPeer.name}@${freshPeer.version}`,
    ]))
    expect(registry.policies[0]).not.toHaveProperty('minimumReleaseAge')
    expect(result.status).toBe('verified')
    expect(result.packages).toEqual(fixture.manifest.packages.map(({ name, version }) => ({ name, version })))
    expect(result.commands.filter(command => command.args.includes('--eval'))).toHaveLength(2)
    expect(await readdir(directory)).toEqual(['consumer-report.json'])
  }
  finally {
    await registry.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 120_000)
