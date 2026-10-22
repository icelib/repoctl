import type { SnapshotPackage, SnapshotReport } from '@icebreakers/monorepo'
import type { SpawnSyncOptions, SpawnSyncReturns } from 'node:child_process'
import type { SnapshotPublicationOptions } from '../../../../../src/commands/release/snapshot/publish/registry'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, vi } from 'vitest'
import { snapshotMetadata } from '../../../../../src/commands/release/snapshot/identity'

const roots: string[] = []
afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

export async function publicationFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'repoctl-snapshot-publication-'))
  roots.push(root)
  await writeFile(path.join(root, 'package.json'), '{"name":"snapshot-publication-test","private":true}')
  await writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: []\n')
  await writeFile(path.join(root, 'user.npmrc'), '')
  await writeFile(path.join(root, 'global.npmrc'), '')
  const identity = { kind: 'nightly' as const, commit: 'a'.repeat(40), buildId: 'run-1' }
  const identityKey = createHash('sha256').update(JSON.stringify(identity)).digest('hex')
  const report: SnapshotReport = {
    schemaVersion: 1,
    identity,
    identityKey,
    source: root,
    outputDirectory: root,
    tag: 'snapshot-nightly',
    registry: 'https://registry.npmjs.org/',
    status: 'prepared',
    packages: ['first', 'second'].map(name => ({ name, version: `1.0.0-snapshot.nightly.c${identity.commit}.b${identityKey}`, currentVersion: '1.0.0', directory: name, reasons: ['snapshot-workspace'], integrity: `sha512-${'A'.repeat(86)}==`, tarball: path.join(root, `${name}.tgz`) })),
    nativePlan: { schemaVersion: 1, branchRule: null, cwd: root, pnpmVersion: '12.13.0', nativeFormat: 'json', status: 'ready', packages: [], blockers: [], notes: { packages: [], entries: [], contributors: [], compareUrls: [] } },
    install: { executable: 'pnpm', args: [] },
    installCommand: '',
  }
  const uploads: string[] = []
  const uploaded = new Set<string>()
  const metadata = (pkg: SnapshotPackage) => ({ name: pkg.name, version: pkg.version, dist: { integrity: pkg.integrity }, repoctlSnapshot: snapshotMetadata(report) })
  const lookup = vi.fn((pkg: SnapshotPackage, _fields: 'version' | 'manifest'): unknown => uploaded.has(pkg.name) ? metadata(pkg) : undefined)
  const done = (status: number, stdout = '', stderr = ''): SpawnSyncReturns<string> => ({ status, stdout, stderr, pid: 1, signal: null, output: [null, stdout, stderr] })
  const spawn = vi.fn((command: string, args: readonly string[], _settings: SpawnSyncOptions): SpawnSyncReturns<string> => {
    if (command === 'pnpm' && args[0] === 'publish') {
      const pkg = report.packages.find(item => item.tarball === args[1])!
      uploads.push(pkg.name)
      uploaded.add(pkg.name)
      return done(0, `+ ${pkg.name}@${pkg.version}`)
    }
    if (command === 'npm' && args[0] === 'view') {
      const pkg = report.packages.find(item => `${item.name}@${item.version}` === args[1])!
      const fields = args.includes('--json') ? 'manifest' : 'version'
      try {
        const value = lookup(pkg, fields)
        if (value === undefined) {
          return done(1, '', 'E404 package not found')
        }
        return done(0, fields === 'version' ? pkg.version : JSON.stringify(value))
      }
      catch (error) {
        return done(1, '', error instanceof Error ? error.message : String(error))
      }
    }
    throw new Error(`Unexpected command: ${command} ${args.join(' ')}`)
  })
  const waits: number[] = []
  const options: SnapshotPublicationOptions = {
    cwd: root,
    identity,
    env: { HOME: root, npm_config_registry: report.registry, npm_config_userconfig: path.join(root, 'user.npmrc'), npm_config_globalconfig: path.join(root, 'global.npmrc') },
    spawn: spawn as unknown as NonNullable<SnapshotPublicationOptions['spawn']>,
    sleep: async (milliseconds) => { waits.push(milliseconds) },
    config: { registry: { requestTimeoutMs: 1_000, visibilityTimeoutMs: 6_000 } },
  }
  const progress = async () => JSON.parse(await readFile(path.join(root, 'publication', 'repoctl-publish-progress.json'), 'utf8'))
  return { root, report, options, uploads, uploaded, lookup, metadata, spawn, waits, progress }
}
