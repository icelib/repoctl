import type { PackageCheckReport } from '../../package-check'
import type { PackedPackage } from '../../package-check/types'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isolatedProcessEnvironment } from '../../../core/process-environment'
import { analyzeTarball, packageCheckTools } from '../../package-check/analyze'
import { consumeTarball } from '../../package-check/consumer'
import { consumerEntries } from '../../package-check/entries'
import { execute, failureMessage } from '../../package-check/process'
import { packageBuildSelector, selectPackages } from '../../package-check/workspace'
import { checkConditionalDependencies } from './dependencies'

export async function validateLibraryArtifact(target: string, directory: string, timeout: number, packageManager: string, signal?: AbortSignal): Promise<PackageCheckReport> {
  const workspace = path.resolve(target, '../..')
  const execution = { signal, packageManager, env: isolatedProcessEnvironment(path.dirname(directory)) }
  const { results } = await selectPackages({ cwd: workspace, filters: [packageBuildSelector(workspace, target)], includePrivate: true }, timeout, execution)
  const report: PackageCheckReport = { schemaVersion: 1, workspaceDir: workspace, status: 'passed', packages: results, retained: false, tools: { ...packageCheckTools } }
  const packed: PackedPackage[] = []
  for (const [index, result] of results.entries()) {
    try {
      const manifestPath = path.join(result.directory, 'package.json')
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      // Publication rehearsal changes only disposable generated packages.
      delete manifest.private
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
      const packDir = path.join(directory, 'tarballs', String(index))
      await mkdir(packDir, { recursive: true })
      const pack = await execute('corepack', ['pnpm', 'pack', '--pack-destination', packDir], result.directory, timeout, execution)
      result.commands.push(pack)
      if (pack.exitCode !== 0) {
        throw new Error(failureMessage(pack))
      }
      const archives = (await readdir(packDir)).filter(file => file.endsWith('.tgz'))
      if (archives.length !== 1) {
        throw new Error('Expected one template library tarball.')
      }
      result.tarball = path.join(packDir, archives[0]!)
      const item: PackedPackage = { result, manifest: {}, bytes: Uint8Array.from(await readFile(result.tarball)) }
      await analyzeTarball(item)
      await checkConditionalDependencies(item)
      packed.push(item)
    }
    catch (error) {
      result.diagnostics.push({ source: 'repoctl', code: 'ARTIFACT_VALIDATION_FAILED', severity: 'error', message: String(error) })
    }
  }
  for (const [index, item] of packed.entries()) {
    try {
      await consumeTarball(item, packed, results, consumerEntries(item.manifest, item.result.files), path.join(directory, 'consumers', String(index)), timeout, execution)
    }
    catch (error) {
      item.result.diagnostics.push({ source: 'repoctl', code: 'CONSUMER_FAILED', severity: 'error', message: String(error) })
    }
  }
  for (const result of results) {
    result.status = result.diagnostics.some(item => item.severity === 'error') ? 'failed' : 'passed'
  }
  report.status = results.some(result => result.status === 'failed') ? 'failed' : 'passed'
  return report
}
