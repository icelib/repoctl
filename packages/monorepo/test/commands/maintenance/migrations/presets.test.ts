import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { prepareMaintenanceUpgrade } from '@icebreakers/monorepo'
import { getAssetTargets } from '@icebreakers/monorepo-templates'
import { expect, it } from 'vitest'
import { getMaintenanceMigrationPolicy } from '@/commands/maintenance/migrations'
import { ledgerPath } from '@/commands/upgrade/migrations/record'
import { presetFixture, presetTarget } from '../preset-fixture'

const { validateMaintenanceArtifact } = await import(new URL('../../../../resources/maintenance/validate.mjs', import.meta.url).href)

it('publishes a reviewed migration and a customized preset upgrade together', async () => {
  const h = await presetFixture({ mixed: true })
  const packageVersion = async (directory: string) => JSON.parse(await readFile(new URL(`../../../../../${directory}/package.json`, import.meta.url), 'utf8')).version as string
  const templateVersion = await packageVersion('monorepo-templates')
  const engineVersion = await packageVersion('monorepo')
  const lock = await readFile(path.join(h.cwd, 'pnpm-lock.yaml'), 'utf8')
  await h.write('pnpm-lock.yaml', `${lock}snapshots:\n  repoctl@${h.version}:\n    dependencies:\n      '@icebreakers/monorepo': ${engineVersion}\n  '@icebreakers/monorepo@${engineVersion}':\n    dependencies:\n      '@icebreakers/monorepo-templates': ${templateVersion}\n`)
  await h.write('.changeset/config.json', '{}\n')
  const head = h.commit('retain legacy migration source')
  const expected = { ...h.expected, head, targets: getAssetTargets(), migrationPolicy: getMaintenanceMigrationPolicy() }
  const request = async (route: string) => {
    const response = await h.request(route)
    return { data: { ...response.data, ...(route.endsWith('/branches/{branch}') ? { commit: { sha: head } } : {}), ...(route.endsWith('/actions/artifacts/{artifact_id}') ? { workflow_run: { id: 123, head_sha: head } } : {}) } }
  }
  const report = await prepareMaintenanceUpgrade({ ...h.options, head })
  expect(report.status, report.errors.join()).toBe('ready')
  expect(report.plan?.migrations?.steps).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'changesets-to-pnpm-versioning', status: 'pending' })]))
  expect(report.presets?.plan?.status).toBe('ready')
  expect(report.files.map(file => file.path)).toEqual(expect.arrayContaining([ledgerPath, presetTarget, h.baselinePath]))
  const cwd = path.join(h.root, 'publisher')
  h.git(['clone', '-q', '--no-hardlinks', h.cwd, cwd], h.root)
  const result = await validateMaintenanceArtifact({ cwd, directory: h.options.outputDirectory, expected, request })
  expect(result.ready).toBe(true)
  const ledger = JSON.parse(await readFile(path.join(cwd, ledgerPath), 'utf8'))
  expect(ledger.entries['changesets-to-pnpm-versioning'].status).toBe('completed')
  expect(ledger.attempt).toBeNull()
  const asset = await readFile(path.join(cwd, presetTarget), 'utf8')
  expect(asset).toContain('first = 10')
  expect(asset).toContain('fourth = 40')
  await expect(readFile(path.join(cwd, '.changeset/config.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(readFile(path.join(cwd, 'node_modules/repoctl/package.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})
