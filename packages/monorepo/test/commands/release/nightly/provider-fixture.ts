import type { NightlyOptions, NightlyReport } from '@icebreakers/monorepo'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import crossSpawn from 'cross-spawn'
import { afterEach } from 'vitest'

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))))

export function reportFixture(provider: 'npm' | 'pkg-pr-new' = 'npm', buildId = '123-1', commit = 'a'.repeat(40)): NightlyReport {
  const identity = { kind: 'nightly' as const, commit, buildId }
  const identityKey = createHash('sha256').update(JSON.stringify(identity)).digest('hex')
  const version = `1.0.0-snapshot.nightly.c${identity.commit}.b${identityKey}`
  const packages = ['@scope/a', 'b'].map(name => ({ name, version, directory: name, currentVersion: '1.0.0', reasons: ['snapshot-workspace'], integrity: `sha512-${'A'.repeat(86)}==` }))
  return {
    schemaVersion: 1,
    status: 'planned',
    provider,
    repository: 'acme/repo',
    branch: 'main',
    eventName: 'schedule',
    source: '/unused',
    commit: identity.commit,
    buildId: identity.buildId,
    packages: packages.map(pkg => ({ ...pkg, locator: provider === 'npm' ? `${pkg.name}@snapshot-nightly` : `https://pkg.pr.new/acme/repo/${pkg.name}@${identity.commit}` })),
    commands: [],
    snapshot: {
      schemaVersion: 1,
      status: 'planned',
      identity,
      identityKey,
      source: '/unused',
      tag: 'snapshot-nightly',
      registry: 'https://registry.npmjs.org/',
      packages,
      nativePlan: { schemaVersion: 1, branchRule: null, cwd: '/unused', pnpmVersion: '12.13.0', nativeFormat: 'json', status: 'ready', packages: [], blockers: [], notes: { packages: [], entries: [], contributors: [], compareUrls: [] } },
      install: { executable: 'pnpm', args: [] },
      installCommand: '',
    },
  }
}

export async function pkgPrFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'repoctl-nightly-provider-'))
  roots.push(root)
  const report = reportFixture('pkg-pr-new')
  report.outputDirectory = root
  report.snapshot!.outputDirectory = root
  report.snapshot!.status = 'prepared'
  const artifacts = new Map<string, Uint8Array<ArrayBuffer>>()
  for (const [index, pkg] of report.snapshot!.packages.entries()) {
    const directory = path.join(root, `package-${index}`)
    await mkdir(path.join(directory, 'package'), { recursive: true })
    await writeFile(path.join(directory, 'package', 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, repoctlSnapshot: { ...report.snapshot!.identity, identityKey: report.snapshot!.identityKey, tag: report.snapshot!.tag } }))
    pkg.tarball = path.join(root, `package-${index}.tgz`)
    const result = crossSpawn.sync('tar', ['--format=ustar', '-czf', pkg.tarball, '-C', directory, 'package'], { encoding: 'utf8' })
    if (result.status !== 0) {
      throw new Error(result.stderr)
    }
    const bytes = Uint8Array.from(await readFile(pkg.tarball))
    pkg.integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
    artifacts.set(pkg.name, bytes)
  }
  const options: NightlyOptions = { cwd: root, env: process.env, sleep: async () => {} }
  return { report, options, root, artifacts }
}
