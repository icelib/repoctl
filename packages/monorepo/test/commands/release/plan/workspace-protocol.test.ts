import { mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { createReleasePlan } from '@icebreakers/monorepo'
import crossSpawn from 'cross-spawn'
import { x } from 'tar'
import { afterEach, expect, it } from 'vitest'
import { cli, fixture, snapshot } from './fixture'

const roots: string[] = []
const ordinaryFields = ['dependencies', 'devDependencies', 'optionalDependencies'] as const

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cwd => rm(cwd, { recursive: true, force: true })))
})

async function workspace(consumer: Record<string, unknown>, withIntent = false) {
  const h = await fixture()
  roots.push(h.cwd)
  await h.write('packages/consumer/package.json', JSON.stringify({ name: 'consumer', version: '1.0.0', ...consumer }))
  if (!withIntent) {
    await rm(path.join(h.cwd, '.changeset/test.md'))
  }
  return h
}

it.each([
  ['workspace:*', '1.0.0'],
  ['workspace:^', '^1.0.0'],
  ['workspace:~', '~1.0.0'],
])('preserves optional peer %s in read-only planning and actual pnpm packing', async (specifier, packedRange) => {
  const h = await workspace({
    peerDependencies: { a: specifier },
    peerDependenciesMeta: { a: { optional: true } },
  })
  const before = await snapshot(h.cwd)
  expect(await createReleasePlan({ cwd: h.cwd, env: h.env })).toMatchObject({ status: 'empty', blockers: [] })
  expect(await snapshot(h.cwd)).toEqual(before)

  const consumerDir = path.join(h.cwd, 'packages/consumer')
  const source = await readFile(path.join(consumerDir, 'package.json'), 'utf8')
  const packed = crossSpawn.sync('pnpm', [
    'pack',
    '--json',
    '--pack-destination',
    path.join(h.cwd, 'tarballs'),
    '--config.ignore-scripts=true',
    '--config.ignore-pnpmfile=true',
  ], { cwd: consumerDir, env: h.env, encoding: 'utf8' })
  expect(packed.status, packed.stderr).toBe(0)
  const { filename } = JSON.parse(packed.stdout)
  const extractedDir = path.join(h.cwd, 'extracted')
  await mkdir(extractedDir)
  await x({ cwd: extractedDir, file: filename }, ['package/package.json'])
  const manifest = JSON.parse(await readFile(path.join(extractedDir, 'package/package.json'), 'utf8'))
  expect(manifest.peerDependencies).toEqual({ a: packedRange })
  expect(manifest.peerDependenciesMeta).toEqual({ a: { optional: true } })
  expect(await readFile(path.join(consumerDir, 'package.json'), 'utf8')).toBe(source)
}, 60_000)

it('accepts workspace:* in every ordinary dependency field', async () => {
  const h = await workspace(Object.fromEntries(ordinaryFields.map(field => [field, { a: 'workspace:*' }])))
  expect(await createReleasePlan({ cwd: h.cwd, env: h.env })).toMatchObject({ status: 'empty', blockers: [] })
})

it('keeps a ready plan and its peer declarations intact when intents bump the target', async () => {
  const h = await workspace({ peerDependencies: { a: 'workspace:^', b: 'workspace:~' } }, true)
  const before = await snapshot(h.cwd)
  const report = await createReleasePlan({ cwd: h.cwd, env: h.env })
  expect(report.status, JSON.stringify(report.blockers)).toBe('ready')
  expect(report.packages.find(pkg => pkg.name === 'a')?.newVersion).toBe('2.0.0')
  expect(await snapshot(h.cwd)).toEqual(before)
})

it.each(ordinaryFields.flatMap(field => ['workspace:^', 'workspace:~', '^1.0.0'].map(specifier => ({ field, specifier }))))(
  'blocks internal $field=$specifier during planning without changing inputs',
  async ({ field, specifier }) => {
    const h = await workspace({ [field]: { a: specifier } })
    const before = await snapshot(h.cwd)
    const report = await createReleasePlan({ cwd: h.cwd, env: h.env })
    expect(report.status).toBe('blocked')
    expect(report.packages).toEqual([])
    expect(report.blockers.some(({ id, detail }) => {
      // pnpm itself rejects non-workspace ranges before repoctl can enforce its stricter policy.
      return (id === 'invalid-release-input' && detail.includes(`packages/consumer/package.json -> ${field}.a=${specifier}`))
        || (id === 'pnpm-plan-failed' && detail.includes('ERR_PNPM_VERSIONING_INTERNAL_RANGE') && detail.includes(field) && detail.includes(specifier))
    }), JSON.stringify(report.blockers)).toBe(true)
    expect(await snapshot(h.cwd)).toEqual(before)
  },
)

it.each(['^1.0.0', 'workspace:>=1.0.0'])('blocks unsupported internal peer %s', async (specifier) => {
  const h = await workspace({ peerDependencies: { a: specifier } })
  const before = await snapshot(h.cwd)
  const report = await createReleasePlan({ cwd: h.cwd, env: h.env })
  expect(report).toMatchObject({ status: 'blocked', packages: [] })
  if (specifier.startsWith('workspace:')) {
    expect(report.blockers).toMatchObject([{ id: 'invalid-release-input' }])
    expect(report.blockers[0]?.detail).toContain(`packages/consumer/package.json -> peerDependencies.a=${specifier}`)
    expect(report.blockers[0]?.detail).toContain('peerDependencies may also use workspace:^ or workspace:~')
  }
  else {
    expect(report.blockers).toMatchObject([{ id: 'pnpm-plan-failed' }])
    expect(report.blockers[0]?.detail).toContain('ERR_PNPM_VERSIONING_INTERNAL_RANGE')
    expect(report.blockers[0]?.detail).toContain('peerDependencies')
    expect(report.blockers[0]?.detail).toContain(specifier)
  }
  expect(await snapshot(h.cwd)).toEqual(before)
})

it('returns a nonzero CLI result for an otherwise ready plan before hooks or writes', async () => {
  const h = await workspace({ dependencies: { a: 'workspace:^' } }, true)
  const before = await snapshot(h.cwd)
  const result = cli(h.cwd, ['--json'], h.env)
  expect(result.status).toBe(1)
  expect(JSON.parse(result.stdout)).toMatchObject({
    status: 'blocked',
    packages: [],
    notes: { packages: [], entries: [], contributors: [], compareUrls: [] },
    blockers: [{ id: 'invalid-release-input' }],
  })
  expect(await snapshot(h.cwd)).toEqual(before)
})

it('leaves external dependency ranges outside workspace policy', async () => {
  const h = await workspace({ dependencies: { external: '^2.0.0' }, peerDependencies: { vite: '^8.0.0' } })
  expect(await createReleasePlan({ cwd: h.cwd, env: h.env })).toMatchObject({ status: 'empty', blockers: [] })
})

it('leaves private consumers outside repoctl\'s stricter workspace:* policy', async () => {
  const h = await workspace({ private: true, dependencies: { a: 'workspace:^' }, peerDependencies: { b: 'workspace:~' } })
  expect(await createReleasePlan({ cwd: h.cwd, env: h.env })).toMatchObject({ status: 'empty', blockers: [] })
})
