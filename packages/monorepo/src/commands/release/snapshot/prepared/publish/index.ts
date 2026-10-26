import type { PreparedSnapshotPublishOptions, PreparedSnapshotPublishReport } from './types'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { auditReleaseOidc } from '../../../oidc'
import { publishWithRetry } from '../../../publish'
import { confirmSnapshotPublication, registryPresence } from '../../publish/registry'
import { verifySnapshotRun } from '../github'
import { publisherEnvironment, snapshotPublicationReport } from './context'
import { assertSnapshotTags, confirmSnapshotTag, preflightSnapshotTags } from './tags'

export type { PreparedSnapshotPublishOptions, PreparedSnapshotPublishReport } from './types'

/** Publish only a GitHub-verified portable bundle; candidate code is never loaded. */
export async function publishPreparedSnapshot(options: PreparedSnapshotPublishOptions): Promise<PreparedSnapshotPublishReport> {
  const env = options.env ?? process.env
  const token = options.token ?? env['GITHUB_TOKEN']
  const verified = await verifySnapshotRun({ ...options, ...(token ? { token } : {}) })
  const { plan, manifest, evidence, files } = verified
  await mkdir(options.outputDirectory, { recursive: true })
  const directory = await mkdtemp(path.join(path.resolve(options.outputDirectory), 'snapshot-publish-'))
  const legacy = snapshotPublicationReport(manifest, directory)
  const report: PreparedSnapshotPublishReport = {
    schemaVersion: 1,
    status: 'failed',
    manifest,
    evidence,
    packages: manifest.packages.map(pkg => ({ name: pkg.name, version: pkg.version, integrity: pkg.integrity, published: false })),
    install: legacy.install,
    installCommand: legacy.installCommand,
    outputDirectory: directory,
  }
  const checkpoint = () => writeFile(path.join(directory, 'publication-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  try {
    const clean = await publisherEnvironment(options, manifest, directory)
    await Promise.all([
      writeFile(path.join(directory, 'package.json'), '{"name":"repoctl-prepared-snapshot-publisher","private":true}\n'),
      writeFile(path.join(directory, 'pnpm-workspace.yaml'), 'packages: []\n'),
      writeFile(path.join(directory, 'user.npmrc'), ''),
      writeFile(path.join(directory, 'global.npmrc'), ''),
    ])
    for (const [relative, bytes] of files) {
      const target = path.join(directory, relative)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, bytes, { flag: 'wx' })
    }
    const publication = { ...options, cwd: directory, env: clean, identity: plan.identity, quiet: true }
    for (const pkg of legacy.packages) {
      pkg.published = await registryPresence(pkg, legacy, publication)
      report.packages.find(item => item.name === pkg.name)!.published = pkg.published
    }
    const baseline = await preflightSnapshotTags(legacy, publication)
    await verified.assertCurrent()
    const audit = await auditReleaseOidc({ packages: manifest.packages.map(pkg => ({ name: pkg.name, version: pkg.version, registry: plan.registry })), env: clean, ...(options.fetch ? { fetch: options.fetch } : {}) })
    if (!audit.ok || audit.identity['event_name'] !== 'workflow_run' || audit.identity['repository_id'] !== String(plan.source.repositoryId)) {
      throw new Error('Prepared snapshot OIDC audit failed or did not identify the verified workflow_run repository.')
    }
    await checkpoint()
    for (const pkg of legacy.packages) {
      await verified.assertCurrent()
      await assertSnapshotTags(legacy, baseline, publication)
      if (!pkg.published) {
        await publishWithRetry([
          '--config.manage-package-manager-versions=false',
          '--config.pm-on-fail=ignore',
          '--config.runtime-on-fail=ignore',
          '--config.ignore-pnpmfile=true',
          'publish',
          pkg.tarball!,
          '--ignore-scripts',
          '--no-git-checks',
          '--provenance',
          '--tag',
          plan.tag,
          '--registry',
          plan.registry,
        ], {
          ...publication,
          beforeAttempt: async () => {
            await verified.assertCurrent()
            await assertSnapshotTags(legacy, baseline, publication)
          },
        }, [pkg], true)
        await confirmSnapshotPublication(pkg, legacy, publication)
        await confirmSnapshotTag(pkg.name, pkg.version, plan.tag, publication)
        pkg.published = true
        report.packages.find(item => item.name === pkg.name)!.published = true
        await checkpoint()
      }
    }
    await assertSnapshotTags(legacy, baseline, publication, true)
    await verified.assertCurrent()
    report.status = 'published'
  }
  catch (error) {
    report.error = error instanceof Error ? error.message : String(error)
  }
  await checkpoint()
  return report
}
