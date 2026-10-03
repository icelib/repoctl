import { Buffer } from 'node:buffer'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
import { digest } from '../fixture'
import { ledgerPath, publisherFixture } from './fixture'

const { validateMaintenanceArtifact } = await import(new URL('../../../../resources/maintenance/validate.mjs', import.meta.url).href)
it.each([false, true])('publishes the exact completed ledger and verified legacy removals: prerelease=%s', async (prerelease) => {
  const h = await publisherFixture({ prerelease, history: true })
  const result = await validateMaintenanceArtifact(h.input)
  expect(result.ready).toBe(true)
  expect((await h.readLedger()).entries['older-migration']).toEqual(h.history.entries['older-migration'])
  expect((await h.readLedger()).entries['changesets-to-pnpm-versioning'].status).toBe('completed')
  await expect(readFile(path.join(h.input.cwd, '.changeset/config.json'))).rejects.toThrow('ENOENT')
  expect(h.git(['diff', '--exit-code'], h.input.cwd)).toBe('')
})
it.each(['no-plan', 'identity', 'path', 'completed', 'pending', 'journal', 'policy'] as const)('rejects forged migration evidence before applying the patch: %s', async (kind) => {
  const h = await publisherFixture()
  const report = structuredClone(h.report)
  const migration = report.plan!.migrations!
  if (kind === 'no-plan') {
    delete report.plan!.migrations
  }
  if (kind === 'identity') {
    migration.steps[0]!.id = 'untrusted-migration'
  }
  if (kind === 'path') {
    migration.ledger!.path = '.repoctl/migrations/other.json'
  }
  if (kind === 'completed') {
    const file = report.plan!.files.find(file => file.path === ledgerPath)!
    const ledger = JSON.parse(Buffer.from(file.content!, 'base64').toString())
    ledger.entries['changesets-to-pnpm-versioning'].status = 'failed'
    const bytes = Buffer.from(JSON.stringify(ledger))
    file.content = bytes.toString('base64')
    file.afterHash = digest(bytes)
  }
  if (kind === 'pending' || kind === 'journal') {
    const pending = JSON.parse(Buffer.from(migration.ledger!.pending, 'base64').toString())
    if (kind === 'pending') {
      pending.entries['changesets-to-pnpm-versioning'].status = 'completed'
    }
    else {
      pending.attempt.files[0].afterHash = '0'.repeat(64)
    }
    migration.ledger!.pending = Buffer.from(JSON.stringify(pending)).toString('base64')
  }
  await h.save(report)
  const expected = kind === 'policy' ? { ...h.expected, migrationPolicy: undefined } : h.expected
  await expect(validateMaintenanceArtifact({ ...h.input, expected })).rejects.toThrow(kind === 'no-plan' ? 'unapproved' : 'migration ledger')
  expect(h.git(['status', '--porcelain'], h.input.cwd)).toBe('')
})
it('rejects a forged completed ledger even when its patch and report hashes agree', async () => {
  const h = await publisherFixture()
  await h.rewritePatch(async (cwd) => {
    const file = path.join(cwd, ledgerPath)
    const ledger = JSON.parse(await readFile(file, 'utf8'))
    ledger.injected = true
    await writeFile(file, JSON.stringify(ledger))
  })
  await expect(validateMaintenanceArtifact(h.input)).rejects.toThrow('migration output differs')
  await expect(readFile(path.join(h.input.directory, 'verified-body.md'))).rejects.toThrow('ENOENT')
})
it('rejects an omitted legacy removal even when its patch and report hashes agree', async () => {
  const h = await publisherFixture()
  await h.rewritePatch(async (cwd) => {
    h.git(['checkout', h.head, '--', '.changeset/config.json'], cwd)
  })
  await expect(validateMaintenanceArtifact(h.input)).rejects.toThrow('migration output differs')
})
it('requires a corresponding committed legacy source for a completion claim', async () => {
  const h = await publisherFixture()
  h.git(['rm', '.changeset/config.json'], h.input.cwd)
  h.git(['-c', 'commit.gpgsign=false', 'commit', '-qm', 'no remaining legacy source'], h.input.cwd)
  const head = h.git(['rev-parse', 'HEAD'], h.input.cwd)
  await h.save({ ...h.report, head })
  await expect(validateMaintenanceArtifact({ ...h.input, expected: { ...h.expected, head } })).rejects.toThrow('committed legacy source is absent')
  expect(h.git(['status', '--porcelain'], h.input.cwd)).toBe('')
})
it('does not allow unrelated metadata under the ledger directory', async () => {
  const h = await publisherFixture()
  const report = structuredClone(h.report)
  report.files.push({ path: '.repoctl/migrations/rogue.json', beforeHash: null, afterHash: '0'.repeat(64), beforeMode: null, afterMode: '100644' })
  await h.save(report)
  await expect(validateMaintenanceArtifact(h.input)).rejects.toThrow('unapproved')
  expect(h.git(['status', '--porcelain'], h.input.cwd)).toBe('')
})
