import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
import { digest } from '../fixture'
import { ledgerPath, publisherFixture } from './fixture'

const { validateMaintenanceArtifact } = await import(new URL('../../../../resources/maintenance/validate.mjs', import.meta.url).href)
it('rejects a consistently forged template cursor even with a known migration identity', async () => {
  const h = await publisherFixture()
  const report = structuredClone(h.report)
  const migration = report.plan!.migrations!
  migration.toVersion = '999.0.0'
  for (const key of ['pending', 'failed'] as const) {
    const ledger = JSON.parse(Buffer.from(migration.ledger![key], 'base64').toString())
    ledger.entries['changesets-to-pnpm-versioning'].toVersion = migration.toVersion
    migration.ledger![key] = Buffer.from(JSON.stringify(ledger)).toString('base64')
  }
  const file = report.plan!.files.find(file => file.path === ledgerPath)!
  const ledger = JSON.parse(Buffer.from(file.content!, 'base64').toString())
  ledger.evaluatedVersion = migration.toVersion
  ledger.entries['changesets-to-pnpm-versioning'].toVersion = migration.toVersion
  const bytes = Buffer.from(JSON.stringify(ledger))
  file.content = bytes.toString('base64')
  file.afterHash = digest(bytes)
  await h.save(report)
  await expect(validateMaintenanceArtifact(h.input)).rejects.toThrow('source cursor or target version differs')
  expect(h.git(['status', '--porcelain'], h.input.cwd)).toBe('')
})
it('checks committed interrupted history even when the report omits migrations', async () => {
  const h = await publisherFixture()
  const pending = Buffer.from(h.report.plan!.migrations!.ledger!.pending, 'base64').toString()
  const { mkdir, writeFile } = await import('node:fs/promises')
  await mkdir(path.dirname(path.join(h.input.cwd, ledgerPath)), { recursive: true })
  await writeFile(path.join(h.input.cwd, ledgerPath), pending)
  h.git(['add', ledgerPath], h.input.cwd)
  h.git(['-c', 'commit.gpgsign=false', 'commit', '-qm', 'interrupted history'], h.input.cwd)
  const head = h.git(['rev-parse', 'HEAD'], h.input.cwd)
  const report = structuredClone(h.report)
  report.head = head
  delete report.plan!.migrations
  await h.save(report)
  await expect(validateMaintenanceArtifact({ ...h.input, expected: { ...h.expected, head } })).rejects.toThrow('interrupted migrations require a reviewed manual upgrade')
  expect(h.git(['status', '--porcelain'], h.input.cwd)).toBe('')
})
it.each(['missing-output', 'wrong-tag'] as const)('rejects a journal that loses prerelease lanes: %s', async (kind) => {
  const h = await publisherFixture({ prerelease: true })
  const report = structuredClone(h.report)
  const migration = report.plan!.migrations!
  const pending = JSON.parse(Buffer.from(migration.ledger!.pending, 'base64').toString())
  if (kind === 'missing-output') {
    report.plan!.files = report.plan!.files.filter(file => file.path !== 'pnpm-workspace.yaml')
    pending.attempt.files = pending.attempt.files.filter((file: {
      path: string
    }) => file.path !== 'pnpm-workspace.yaml')
    migration.steps[0]!.files = migration.steps[0]!.files.filter(filename => filename !== 'pnpm-workspace.yaml')
  }
  else {
    for (const files of [report.plan!.files, pending.attempt.files]) {
      const file = files.find((file: {
        path: string
      }) => file.path === 'pnpm-workspace.yaml')!
      const content = Buffer.from(file.content, 'base64').toString().replace(': beta', ': wrong')
      file.content = Buffer.from(content).toString('base64')
      file.afterHash = digest(content)
    }
  }
  pending.attempt.id = digest(JSON.stringify({ files: pending.attempt.files, inputs: pending.attempt.inputs, discovery: pending.attempt.discovery }))
  const failed = JSON.parse(Buffer.from(migration.ledger!.failed, 'base64').toString())
  failed.attempt = pending.attempt
  migration.ledger!.pending = Buffer.from(JSON.stringify(pending)).toString('base64')
  migration.ledger!.failed = Buffer.from(JSON.stringify(failed)).toString('base64')
  await h.save(report)
  await expect(validateMaintenanceArtifact(h.input)).rejects.toThrow('prerelease lanes')
  expect(h.git(['status', '--porcelain'], h.input.cwd)).toBe('')
  expect(await readFile(path.join(h.input.cwd, '.changeset/pre.json'), 'utf8')).toContain('beta')
})
