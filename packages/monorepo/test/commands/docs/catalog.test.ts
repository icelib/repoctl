import { planDocsDeployment } from '@icebreakers/monorepo'
import { afterEach, expect, it } from 'vitest'
import { cleanup, commit, fixture, makeRecord, put } from './helpers'

afterEach(cleanup)

function workspace(version: string, catalog: string, unrelated = '^1.0.0') {
  const entries = `alias: ${version}\n${catalog ? '    ' : '  '}unrelated: ${unrelated}\n`
  return `packages:\n  - packages/*\n${catalog ? `catalogs:\n  ${catalog}:\n    ` : 'catalog:\n  '}${entries}`
}

async function catalogFixture(field: string, catalog: string) {
  const context = await fixture()
  const { cwd, options } = context
  await put(cwd, 'packages/runtime/package.json', JSON.stringify({
    name: 'runtime',
    version: '1.0.0',
    [field]: { alias: `catalog:${catalog}` },
  }))
  await put(cwd, 'pnpm-workspace.yaml', workspace('^1.0.0', catalog))
  const publishedSha = commit(cwd)
  options.config!.sites!['website']!.releaseInputs = { runtime: ['packages/runtime/src/**'] }
  return { ...context, publishedSha }
}

async function recordPartialRelease(context: Awaited<ReturnType<typeof catalogFixture>>) {
  const sourceSha = commit(context.cwd)
  const record = makeRecord(sourceSha, {
    packages: [
      { name: 'core', version: '1.0.0', sourceSha },
      { name: 'runtime', version: '1.0.0', sourceSha: context.publishedSha },
    ],
    releasedPackages: ['core'],
  })
  await context.store.github.writeAutomationState(`releases/${record.id}`, record)
  return { ...context.options, release: record.id }
}

it.each([
  ['dependencies', ''],
  ['optionalDependencies', ''],
  ['peerDependencies', ''],
  ['devDependencies', ''],
  ['dependencies', 'runtime'],
  ['optionalDependencies', 'runtime'],
  ['peerDependencies', 'runtime'],
  ['devDependencies', 'build'],
])('blocks changed published %s catalog:%s values using the frozen release', async (field, catalog) => {
  const context = await catalogFixture(field, catalog)
  await put(context.cwd, 'pnpm-workspace.yaml', workspace('^2.0.0', catalog))
  const request = await recordPartialRelease(context)
  // main can advance again; the plan must compare the release's value, not today's.
  await put(context.cwd, 'pnpm-workspace.yaml', workspace('^3.0.0', catalog))
  commit(context.cwd)
  const plan = await planDocsDeployment(request)
  expect(plan.eligible).toBe(false)
  expect(plan.blockers).toContain(`Unpublished catalog dependency for runtime: ${field}.alias (catalog:${catalog}: ^1.0.0 -> ^2.0.0)`)
})

it.each(['', 'build'])('allows unreferenced catalog:%s changes during a partial release', async (catalog) => {
  const context = await catalogFixture('devDependencies', catalog)
  await put(context.cwd, 'pnpm-workspace.yaml', workspace('^1.0.0', catalog, '^2.0.0'))
  const plan = await planDocsDeployment(await recordPartialRelease(context))
  expect(plan).toMatchObject({ eligible: true, skipped: false, blockers: [] })
})

it('retains an explicit workspace file release input even for unreferenced catalog changes', async () => {
  const context = await catalogFixture('devDependencies', '')
  context.options.config!.sites!['website']!.releaseInputs!['runtime']!.push('pnpm-workspace.yaml')
  await put(context.cwd, 'pnpm-workspace.yaml', workspace('^1.0.0', '', '^2.0.0'))
  const plan = await planDocsDeployment(await recordPartialRelease(context))
  expect(plan.eligible).toBe(false)
  expect(plan.blockers).toContain('Unpublished inputs for runtime: pnpm-workspace.yaml')
})

it('fails closed when a referenced development catalog entry disappears', async () => {
  const context = await catalogFixture('devDependencies', 'build')
  await put(context.cwd, 'pnpm-workspace.yaml', 'packages:\n  - packages/*\n')
  await expect(planDocsDeployment(await recordPartialRelease(context))).rejects.toThrow('Cannot resolve documentation runtime catalog dependency: alias (catalog:build)')
})
