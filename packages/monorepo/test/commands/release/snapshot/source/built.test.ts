import type { SnapshotPreparationContext } from '@icebreakers/monorepo'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createPackageFromTarballData } from '@arethetypeswrong/core'
import { releaseSnapshot } from '@icebreakers/monorepo'
import { expect, it, vi } from 'vitest'
import { snapshot } from '../fixture'
import { sha256, sourceFixture } from './fixture'

it('prepares exact committed archives after install and snapshot manifests, preserving Git identity and artifact bytes', async () => {
  const h = await sourceFixture(true)
  const before = await snapshot(h.cwd)
  const order: string[] = []
  const spawn = ((command, args, settings) => {
    if (command === 'pnpm' && args?.includes('install')) {
      order.push('install')
    }
    if (command === 'pnpm' && args?.includes('build')) {
      order.push('build')
    }
    return h.options.spawn!(command, args ?? [], settings!)
  }) as NonNullable<typeof h.options.spawn>
  const prepareSource = vi.fn(async (context: SnapshotPreparationContext) => {
    order.push('prepare')
    expect(context.identity.commit).toBe(h.commit)
    expect(context.tree).toBe(h.tree)
    expect(context.referenceGitlinks).toEqual([{ path: 'references/tooling', commit: h.run('git', ['rev-parse', `${h.commit}^`]) }])
    expect(context.directory).not.toBe(h.cwd)
    expect(Object.isFrozen(context.packages[0])).toBe(true)
    const manifest = JSON.parse(await readFile(path.join(context.directory, 'packages/a/package.json'), 'utf8'))
    const pkg = context.packages.find(pkg => pkg.name === 'snapshot-a')!
    expect(manifest.version).toBe(pkg.version)
    expect(pkg.currentVersion).toBe('1.0.0')
    await writeFile(path.join(context.directory, 'packages/a/binding.node'), 'native-input')
    return { files: [{ path: 'packages/a/binding.node', sha256: sha256('native-input') }], metadata: { producer: 'same-run' } }
  })
  const report = await releaseSnapshot({ ...h.options, spawn, referenceGitlinks: ['references/tooling'], prepareSource })
  expect(report.status, report.error).toBe('prepared')
  expect(order).toEqual(['install', 'prepare', 'build'])
  expect(prepareSource).toHaveBeenCalledOnce()
  expect(report.sourceTree).toBe(h.tree)
  expect(report.preparation).toEqual({ commit: h.commit, tree: h.tree, files: [{ path: 'packages/a/binding.node', sha256: sha256('native-input') }], metadata: { producer: 'same-run' } })
  const pkg = report.packages.find(pkg => pkg.name === 'snapshot-a')!
  const packed = createPackageFromTarballData(Uint8Array.from(await readFile(pkg.tarball!)))
  expect(packed.readFile('/node_modules/snapshot-a/binding.node')).toBe('native-input')
  expect(await snapshot(h.cwd)).toEqual(before)
  expect(h.run('git', ['rev-parse', 'HEAD'])).toBe(h.commit)
  expect(h.run('git', ['rev-parse', 'HEAD^{tree}'])).toBe(h.tree)
}, 120_000)

it('never runs preparation in a dry run and persists callback failures before build or upload', async () => {
  const h = await sourceFixture()
  const prepareSource = vi.fn(async () => {
    throw new Error('Untrusted native input')
  })
  expect((await releaseSnapshot({ ...h.options, dryRun: true, prepareSource })).status).toBe('planned')
  expect(prepareSource).not.toHaveBeenCalled()
  const report = await releaseSnapshot({ ...h.options, prepareSource })
  expect(report.status).toBe('failed')
  expect(report.error).toContain('Untrusted native input')
  expect(report.preparation).toBeUndefined()
  expect(JSON.parse(await readFile(path.join(report.outputDirectory!, 'snapshot-report.json'), 'utf8')).error).toContain('Untrusted native input')
  expect(h.uploads).toEqual([])
}, 120_000)

it('rejects build lifecycle replacement of a verified artifact before any upload', async () => {
  const h = await sourceFixture()
  const build = await readFile(path.join(h.cwd, 'build.cjs'), 'utf8')
  await h.write('build.cjs', `${build}\nrequire('node:fs').writeFileSync('packages/a/binding.node','replaced')`)
  h.run('git', ['add', 'build.cjs'])
  h.run('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'replace artifact'])
  const report = await releaseSnapshot({ ...h.options, identity: { ...h.options.identity, commit: h.run('git', ['rev-parse', 'HEAD']) }, prepareSource: async ({ directory }) => {
    await writeFile(path.join(directory, 'packages/a/binding.node'), 'native-input')
    return { files: [{ path: 'packages/a/binding.node', sha256: sha256('native-input') }] }
  } })
  expect(report.status).toBe('failed')
  expect(report.error).toContain('prepared artifact changed during build or pack')
  expect(h.uploads).toEqual([])
}, 120_000)
