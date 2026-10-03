import type { MaintenanceUpgradeReport } from '@icebreakers/monorepo'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { prepareMaintenanceUpgrade } from '@icebreakers/monorepo'
import { getAssetTargets } from '@icebreakers/monorepo-templates'
import { expect } from 'vitest'
import { getMaintenanceMigrationPolicy } from '@/commands/maintenance/migrations'
import { ledgerPath } from '@/commands/upgrade/migrations/record'
import { digest, fixture } from '../fixture'

export { ledgerPath }
export async function migrationFixture(options: {
  prerelease?: boolean
  history?: boolean
} = {}) {
  const h = await fixture()
  const packageVersion = async (directory: string) => JSON.parse(await readFile(new URL(`../../../../../${directory}/package.json`, import.meta.url), 'utf8')).version as string
  const templateVersion = await packageVersion('monorepo-templates')
  const engineVersion = await packageVersion('monorepo')
  const lock = await readFile(path.join(h.cwd, 'pnpm-lock.yaml'), 'utf8')
  await h.write('pnpm-lock.yaml', `${lock}snapshots:\n  repoctl@${h.version}:\n    dependencies:\n      '@icebreakers/monorepo': ${engineVersion}\n  '@icebreakers/monorepo@${engineVersion}':\n    dependencies:\n      '@icebreakers/monorepo-templates': ${templateVersion}\n`)
  await h.write('.changeset/config.json', '{}\n')
  if (options.prerelease) {
    await h.write('.changeset/pre.json', '{"mode":"pre","tag":"beta"}\n')
    await h.write('pnpm-workspace.yaml', 'packages:\n  - \'packages/*\'\n')
    await h.write('packages/public/package.json', '{"name":"@example/public","version":"1.0.0"}\n')
    await h.write('packages/private/package.json', '{"name":"@example/private","version":"1.0.0","private":true}\n')
  }
  const history = { schemaVersion: 1, evaluatedVersion: '0.5.0', entries: { 'older-migration': { version: '0.1.0', status: 'completed', fromVersion: null, toVersion: '0.5.0' } }, attempt: null }
  if (options.history) {
    await h.write(ledgerPath, `${JSON.stringify(history)}\n`)
  }
  h.git(['add', '.'])
  h.git(['-c', 'commit.gpgsign=false', 'commit', '-qm', 'retain recognized legacy source'])
  const head = h.git(['rev-parse', 'HEAD'])
  const expected = { ...h.expected, head, targets: getAssetTargets(), migrationPolicy: getMaintenanceMigrationPolicy() }
  const request = async (route: string) => {
    const response = await h.request(route)
    return { data: { ...response.data, ...(route.endsWith('/branches/{branch}') ? { commit: { sha: head } } : {}), ...(route.endsWith('/actions/artifacts/{artifact_id}') ? { workflow_run: { id: 123, head_sha: head } } : {}) } }
  }
  const settings = { ...h.options, head, outputDirectory: path.join(h.root, 'repoctl-maintenance-artifact') }
  return { ...h, head, expected, request, settings, history }
}
export async function publisherFixture(options: {
  prerelease?: boolean
  history?: boolean
} = {}) {
  const h = await migrationFixture(options)
  const report = await prepareMaintenanceUpgrade(h.settings)
  expect(report.status, report.errors.join()).toBe('ready')
  const cwd = path.join(h.root, 'publisher')
  h.git(['clone', '-q', '--no-hardlinks', h.cwd, cwd], h.root)
  h.git(['config', 'user.name', 'Fixture'], cwd)
  h.git(['config', 'user.email', 'fixture@example.com'], cwd)
  const save = async (value: MaintenanceUpgradeReport) => writeFile(path.join(h.settings.outputDirectory, 'report.json'), JSON.stringify(value))
  const input = { cwd, directory: h.settings.outputDirectory, expected: h.expected, request: h.request }
  const rewritePatch = async (mutate: (cwd: string) => Promise<void>) => {
    const patchFile = path.join(input.directory, 'changes.patch')
    h.git(['apply', '--index', patchFile], cwd)
    await mutate(cwd)
    h.git(['add', '-A'], cwd)
    const modified = structuredClone(report)
    const names = h.git(['diff', '--cached', '--name-only'], cwd).split('\n')
    modified.files = names.map((filename) => {
      const original = report.files.find(file => file.path === filename)!
      const metadata = h.git(['ls-files', '--stage', '--', filename], cwd)
      return { ...original, afterHash: metadata ? digest(h.gitBytes(['show', `:${filename}`], cwd)) : null, afterMode: metadata ? metadata.split(' ')[0]! : null }
    })
    const patch = h.gitBytes(['diff', '--cached', '--binary', '--full-index', '--no-renames', h.head], cwd)
    modified.patchHash = digest(patch)
    await writeFile(patchFile, patch)
    await save(modified)
    h.git(['reset', '--hard', h.head], cwd)
  }
  return { ...h, report, input, save, rewritePatch, readLedger: async () => JSON.parse(await readFile(path.join(cwd, ledgerPath), 'utf8')) }
}
