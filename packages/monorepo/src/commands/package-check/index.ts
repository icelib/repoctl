import type { PackageCheckOptions, PackageCheckReport, PackedPackage } from './types'
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { analyzeTarball, packageCheckTools } from './analyze'
import { consumeTarball } from './consumer'
import { consumerEntries } from './entries'
import { execute, failureMessage } from './process'
import { packageBuildSelector, selectPackages } from './workspace'

export type { PackageCheckCommand, PackageCheckDiagnostic, PackageCheckOptions, PackageCheckReport, PackageCheckResult } from './types'

/** Build, pack, and consume actual publish artifacts without publishing or versioning. */
export async function checkPackages(options: PackageCheckOptions): Promise<PackageCheckReport> {
  if (process.env['REPOCTL_PACKAGE_CHECK_RUNNING']) {
    throw new Error('package check cannot run recursively from a build or pack lifecycle script.')
  }
  const timeout = options.timeoutMs ?? 600_000
  if (!Number.isFinite(timeout) || timeout <= 0 || (!options.buildScript?.trim() && options.buildScript !== undefined)) {
    throw new Error('Provide a positive timeoutMs and a nonempty buildScript.')
  }
  const { workspaceDir, results, buildDirectories } = await selectPackages(options, timeout)
  const report: PackageCheckReport = { schemaVersion: 1, workspaceDir, status: 'passed', packages: results, retained: false, tools: { ...packageCheckTools } }
  const active = results.filter(result => result.status !== 'skipped')
  if (!active.length) {
    return report
  }
  const selectors = buildDirectories.flatMap(directory => ['--filter', packageBuildSelector(workspaceDir, directory)])
  report.build = await execute('pnpm', [...selectors, '--recursive', '--fail-if-no-match', '--if-present', 'run', options.buildScript ?? 'build'], workspaceDir, timeout)
  if (report.build.exitCode !== 0) {
    report.status = 'failed'
    for (const result of active) {
      result.status = 'skipped'
      result.reason = 'build_failed'
      result.diagnostics.push({ source: 'repoctl', code: 'BUILD_FAILED', severity: 'error', message: failureMessage(report.build) })
    }
    return report
  }
  const directory = await mkdtemp(path.join(tmpdir(), 'repoctl-package-check-'))
  report.temporaryDirectory = directory
  const packed: PackedPackage[] = []
  try {
    for (const [index, result] of active.entries()) {
      try {
        const packDir = path.join(directory, 'tarballs', String(index))
        await mkdir(packDir, { recursive: true })
        const command = await execute('pnpm', ['pack', '--pack-destination', packDir], result.directory, timeout)
        result.commands.push(command)
        if (command.exitCode !== 0) {
          throw new Error(failureMessage(command))
        }
        const files = (await readdir(packDir)).filter(file => file.endsWith('.tgz'))
        if (files.length !== 1) {
          throw new Error('Expected exactly one tarball from pnpm pack.')
        }
        result.tarball = path.join(packDir, files[0]!)
        const item: PackedPackage = { result, bytes: Uint8Array.from(await readFile(result.tarball)), manifest: {} }
        await analyzeTarball(item)
        packed.push(item)
      }
      catch (error) {
        result.diagnostics.push({ source: 'repoctl', code: 'PACK_ANALYSIS_FAILED', severity: 'error', message: String(error) })
      }
    }
    for (const [index, item] of packed.entries()) {
      try {
        await consumeTarball(item, packed, results, consumerEntries(item.manifest, item.result.files), path.join(directory, 'consumers', String(index)), timeout)
      }
      catch (error) {
        item.result.diagnostics.push({ source: 'repoctl', code: 'CONSUMER_FAILED', severity: 'error', message: String(error) })
      }
    }
    for (const result of active) {
      result.status = result.diagnostics.some(item => item.severity === 'error' || (options.strict && item.severity === 'warning')) ? 'failed' : 'passed'
    }
    report.status = active.some(result => result.status === 'failed') ? 'failed' : 'passed'
    return report
  }
  finally {
    report.retained = options.keepTemp === true
    if (!report.retained) {
      await rm(directory, { recursive: true, force: true })
    }
  }
}
