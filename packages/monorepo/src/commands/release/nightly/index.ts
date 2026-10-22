import type { SnapshotOptions } from '../snapshot/types'
import type { NightlyOptions, NightlyReport } from './types'
import { realpath } from 'node:fs/promises'
import process from 'node:process'
import { resolveNightlyConfig } from '../../../core/nightly/config'
import { clearWorkspaceCache, getWorkspaceData } from '../../../core/workspace'
import { runUncachedQualityScripts } from '../hooks'
import { auditReleaseOidc } from '../oidc'
import { createSnapshotPlan, prepareNightlySnapshot } from '../snapshot'
import { assertSnapshotAuthorization, assertSnapshotSource } from '../snapshot/identity'
import { isolatedSnapshotEnvironment, snapshotCommand } from '../snapshot/process'
import { publishSnapshotArtifacts } from '../snapshot/publish'
import { verifyNightlyConsumer } from './consumer'
import { nightlyContext } from './context'
import { nightlyCommand } from './process'
import { confirmNpmNightly, inspectNpmNightly } from './providers/npm'
import { publishPkgPrNew } from './providers/pkg-pr-new'
import { inspectPkgPrNew, pkgPrNewLocator } from './providers/pkg-pr-new/registry'
import { checkpointNightly, createNightlyOutput, writeNightlySummary } from './report'

export { formatNightlySummary, writeNightlySummary } from './report'
export type { NightlyConsumerReport, NightlyOptions, NightlyPackage, NightlyReport } from './types'

function updatePackages(report: NightlyReport) {
  report.packages = report.snapshot!.packages.map(pkg => ({
    name: pkg.name,
    version: pkg.version,
    locator: report.provider === 'npm' ? `${pkg.name}@snapshot-nightly` : pkgPrNewLocator(report.repository, pkg.name, report.commit),
    ...(pkg.integrity ? { integrity: pkg.integrity } : {}),
    ...(pkg.published !== undefined ? { published: pkg.published } : {}),
  }))
}

async function nightly(options: NightlyOptions, execute: boolean): Promise<NightlyReport> {
  const env = options.env ?? process.env
  const report: NightlyReport = {
    schemaVersion: 1,
    status: 'planned',
    provider: 'npm',
    repository: env['GITHUB_REPOSITORY'] ?? '',
    branch: '',
    eventName: env['GITHUB_EVENT_NAME'] ?? '',
    source: options.cwd,
    commit: env['GITHUB_SHA'] ?? '',
    buildId: '',
    packages: [],
    commands: [],
  }
  try {
    const config = resolveNightlyConfig(options.config?.nightly)
    report.provider = config.provider
    const context = await nightlyContext(options, config)
    Object.assign(report, { repository: context.repository, branch: context.branch, eventName: context.eventName, commit: context.commit, buildId: context.buildId })
    report.source = await realpath(snapshotCommand('git', ['rev-parse', '--show-toplevel'], options))
    report.outputDirectory = await createNightlyOutput(report.source, options)
    const snapshotOptions: SnapshotOptions = { ...options, cwd: report.source, identity: context.identity, outputDirectory: report.outputDirectory, registry: 'https://registry.npmjs.org/' }
    assertSnapshotSource(snapshotOptions)
    if (context.skipReason) {
      report.status = 'skipped'
      report.reason = context.skipReason
      return report
    }
    clearWorkspaceCache()
    const workspace = await getWorkspaceData(report.source, { ignorePrivatePackage: false, ignoreRootPackage: false })
    if (!workspace.packages.some(pkg => pkg.manifest.private !== true)) {
      report.status = 'skipped'
      report.reason = 'No public workspace packages are available for nightly publication.'
      return report
    }
    report.snapshot = await createSnapshotPlan(snapshotOptions)
    updatePackages(report)
    const complete = report.provider === 'npm' ? await inspectNpmNightly(report, options) : await inspectPkgPrNew(report, options)
    if (report.provider === 'npm' && report.eventName === 'schedule' && complete) {
      report.status = 'skipped'
      report.reason = 'Every public package already matches this commit and the same nightly build identity.'
      return report
    }
    if (!execute || options.dryRun) {
      return report
    }
    if (options.publish) {
      await assertSnapshotAuthorization(snapshotOptions)
      if (report.provider === 'npm') {
        report.oidc = await auditReleaseOidc({ cwd: report.source, env, ...(options.registryFetch ? { fetch: options.registryFetch } : {}), packageNames: report.packages.map(pkg => pkg.name) })
        if (!report.oidc.ok) {
          throw new Error('npm Trusted Publisher audit failed for the exact nightly package plan; no artifacts were uploaded.')
        }
      }
    }
    const qualityEnv = { ...env }
    delete qualityEnv['REPOCTL_SNAPSHOT_PUBLISH']
    await runUncachedQualityScripts({ ...options, cwd: report.source, env: qualityEnv }, (command, args, settings) => {
      nightlyCommand(report, settings, command, args)
    })
    assertSnapshotSource(snapshotOptions)
    await checkpointNightly(report)
    await prepareNightlySnapshot(report.snapshot, snapshotOptions, { provider: report.provider, repository: report.repository })
    updatePackages(report)
    report.status = 'prepared'
    const checkpoint = async () => {
      updatePackages(report)
      await checkpointNightly(report)
    }
    await checkpoint()
    if (options.publish) {
      if (report.provider === 'npm') {
        await publishSnapshotArtifacts(report.snapshot, { ...snapshotOptions, env: isolatedSnapshotEnvironment(snapshotOptions, report.snapshot.outputDirectory!) }, checkpoint)
        await confirmNpmNightly(report, options)
      }
      else {
        await publishPkgPrNew(report, options, checkpoint)
      }
      updatePackages(report)
      await checkpoint()
      await verifyNightlyConsumer(report, options)
      report.status = 'published'
    }
    return report
  }
  catch (error) {
    report.status = 'failed'
    report.error = error instanceof Error ? error.message : String(error)
    if (report.snapshot) {
      updatePackages(report)
    }
    return report
  }
  finally {
    await checkpointNightly(report)
    await writeNightlySummary(report, env['GITHUB_STEP_SUMMARY'])
  }
}

/** Read-only source and provider inspection, with an external diagnostic report. */
export function createNightlyPlan(options: NightlyOptions) {
  return nightly(options, false)
}

/** Prepare by default; publish only when explicitly requested and authorized. */
export function releaseNightly(options: NightlyOptions) {
  return nightly(options, true)
}
