import type { ExpectedWorkspaceLocator } from '../../package-check/consumer/dependencies'
import type { PackedPackage } from '../../package-check/types'
import type { SnapshotPublicationTarget } from './archive/finalize'
import type { SnapshotWorkspaceReferences } from './manifests'
import type { SnapshotOptions, SnapshotReport } from './types'
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { analyzeTarball } from '../../package-check/analyze'
import { consumeTarball } from '../../package-check/consumer'
import { consumerEntries } from '../../package-check/entries'
import { finalizeSnapshotTarball } from './archive/finalize'
import { isolatedPnpmOptions, snapshotCommand } from './process'

export async function prepareSnapshotArtifacts(source: string, report: SnapshotReport, options: SnapshotOptions, target: SnapshotPublicationTarget, references: SnapshotWorkspaceReferences) {
  snapshotCommand('pnpm', [...isolatedPnpmOptions, 'run', 'build'], { ...options, cwd: source })
  const packed: PackedPackage[] = []
  const locators = new Map<string, ReadonlyMap<string, ExpectedWorkspaceLocator>>()
  for (const [index, pkg] of report.packages.entries()) {
    const directory = path.join(report.outputDirectory!, 'tarballs', String(index))
    await mkdir(directory, { recursive: true })
    // Identity lives in the verified manifest; avoid long name/version-derived paths on Windows.
    snapshotCommand('pnpm', [...isolatedPnpmOptions, 'pack', '--out', path.join(directory, 'package.tgz')], { ...options, cwd: path.join(source, pkg.directory) })
    const files = (await readdir(directory)).filter(file => file.endsWith('.tgz'))
    if (files.length !== 1) {
      throw new Error(`Expected exactly one snapshot tarball for ${pkg.name}.`)
    }
    pkg.tarball = path.join(directory, files[0]!)
    const finalized = await finalizeSnapshotTarball(await readFile(pkg.tarball), pkg, report, target, references)
    const { bytes } = finalized
    await writeFile(pkg.tarball, bytes)
    locators.set(pkg.name, finalized.expected)
    pkg.integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
    const item: PackedPackage = {
      bytes,
      manifest: {},
      result: { name: pkg.name, directory: path.join(source, pkg.directory), role: 'selected', status: 'passed', tarball: pkg.tarball, files: [], diagnostics: [], commands: [] },
    }
    await analyzeTarball(item)
    packed.push(item)
  }
  report.checks = packed.map(item => item.result)
  for (const [index, item] of packed.entries()) {
    await consumeTarball(item, packed, report.checks, consumerEntries(item.manifest, item.result.files), path.join(report.outputDirectory!, 'consumers', String(index)), 600_000, { env: options.env ?? process.env, expectedWorkspaceLocators: locators })
    item.result.status = item.result.diagnostics.some(diagnostic => diagnostic.severity === 'error') ? 'failed' : 'passed'
  }
  if (report.checks.some(check => check.status === 'failed')) {
    throw new Error(`Snapshot package validation failed: ${report.checks.filter(check => check.status === 'failed').map(check => `${check.name}: ${check.diagnostics.filter(item => item.severity === 'error').map(item => item.code).join(', ')}`).join('; ')}`)
  }
  report.status = 'prepared'
}
