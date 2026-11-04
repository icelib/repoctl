import type { BootstrapOptions, BootstrapReport } from './types'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { positive, record } from '../snapshot/prepared/github/client'
import { verifyBootstrapConsumer } from './consumer'
import { bootstrapBundle } from './evidence'
import { emptyBootstrapOutput } from './output'
import { writeBootstrapReport } from './publication'
import { confirmBootstrapRegistry } from './registry'

/** 恢复只使用原运行的不可变证据，不构建、不交换凭据，也不重新上传。 */
export async function verifyBootstrapPublication(options: BootstrapOptions): Promise<BootstrapReport> {
  assert.ok(!options.dryRun && options.outputDirectory, 'Bootstrap recovery requires an evidence directory and cannot be a dry-run')
  const bundle = await bootstrapBundle(options, 'publication')
  const { manifest } = bundle
  const bytes = bundle.files.get('bootstrap-report.json')
  assert.ok(bytes, 'Bootstrap publication artifact has no acceptance report')
  const source = record(JSON.parse(Buffer.from(bytes).toString('utf8')))
  assert.equal(source['schemaVersion'], 1)
  assert.equal(source['accepted'], true, 'The original run has no accepted upload; select a new version for a new upload')
  assert.deepEqual(source['manifest'], manifest, 'Publication report refers to a different prepared artifact')
  const tags = record(source['baselineTags'])
  assert.ok(Object.values(tags).every(value => typeof value === 'string'))
  const directory = path.resolve(options.outputDirectory)
  await emptyBootstrapOutput(directory)
  await mkdir(path.join(directory, 'tarballs'), { recursive: true })
  const report: BootstrapReport = {
    schemaVersion: 1,
    status: 'published',
    plan: manifest,
    manifest,
    outputDirectory: directory,
    accepted: true,
    confirmed: false,
    baselineTags: tags as Record<string, string>,
    verification: {
      sourceRunId: bundle.artifact.runId,
      sourceRunAttempt: bundle.artifact.runAttempt,
      artifactId: positive(bundle.artifact.id, 'artifact ID'),
      artifactDigest: String(bundle.artifact.digest),
      runId: bundle.context.currentRun,
      runAttempt: positive(Number(bundle.context.env['GITHUB_RUN_ATTEMPT']), 'verification attempt'),
      checkedAt: new Date().toISOString(),
    },
  }
  await Promise.all([
    writeFile(path.join(directory, 'source-publication-report.json'), bytes, { flag: 'wx' }),
    writeFile(path.join(directory, 'bootstrap-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' }),
    writeFile(path.join(directory, manifest.package.tarball), bundle.tarball, { flag: 'wx' }),
  ])
  try {
    await confirmBootstrapRegistry(report, options)
    await verifyBootstrapConsumer(report, options)
    report.status = 'verified'
  }
  catch (error) {
    report.status = 'failed'
    report.error = error instanceof Error ? error.message : String(error)
  }
  await writeBootstrapReport(report)
  return report
}
