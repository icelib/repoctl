import type { PackedPackage } from '../../package-check/types'
import type { SnapshotOptions, SnapshotReport } from './types'
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { analyzeTarball } from '../../package-check/analyze'
import { consumeTarball } from '../../package-check/consumer'
import { dependencyReferences } from '../../package-check/dependencies'
import { consumerEntries } from '../../package-check/entries'
import { matchesSnapshotMetadata } from './identity'
import { isolatedPnpmOptions, snapshotCommand } from './process'

export async function prepareSnapshotArtifacts(source: string, report: SnapshotReport, options: SnapshotOptions) {
  snapshotCommand('pnpm', [...isolatedPnpmOptions, 'run', 'build'], { ...options, cwd: source })
  const packed: PackedPackage[] = []
  for (const [index, pkg] of report.packages.entries()) {
    const directory = path.join(report.outputDirectory!, 'tarballs', String(index))
    await mkdir(directory, { recursive: true })
    snapshotCommand('pnpm', [...isolatedPnpmOptions, 'pack', '--pack-destination', directory], { ...options, cwd: path.join(source, pkg.directory) })
    const files = (await readdir(directory)).filter(file => file.endsWith('.tgz'))
    if (files.length !== 1) {
      throw new Error(`Expected exactly one snapshot tarball for ${pkg.name}.`)
    }
    pkg.tarball = path.join(directory, files[0]!)
    const bytes = Uint8Array.from(await readFile(pkg.tarball))
    pkg.integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
    const item: PackedPackage = {
      bytes,
      manifest: {},
      result: { name: pkg.name, directory: path.join(source, pkg.directory), role: 'selected', status: 'passed', tarball: pkg.tarball, files: [], diagnostics: [], commands: [] },
    }
    await analyzeTarball(item)
    const manifest = item.manifest as typeof item.manifest & { repoctlSnapshot?: { identityKey?: string }, publishConfig?: { tag?: string, registry?: string } }
    if (manifest.name !== pkg.name || manifest.version !== pkg.version || !matchesSnapshotMetadata(manifest.repoctlSnapshot, report)
      || manifest.publishConfig?.tag !== report.tag || manifest.publishConfig?.registry !== report.registry) {
      throw new Error(`Packed snapshot identity or publication target changed for ${pkg.name}.`)
    }
    for (const ref of dependencyReferences(manifest, item.result.directory, true)) {
      const target = report.packages.find(candidate => candidate.name === ref.name)
      if (ref.protocol !== 'registry' || (target && ref.range !== target.version) || ref.range.startsWith('catalog:')) {
        throw new Error(`Packed snapshot dependency is not an exact publishable version: ${pkg.name} ${ref.alias}.`)
      }
    }
    packed.push(item)
  }
  report.checks = packed.map(item => item.result)
  for (const [index, item] of packed.entries()) {
    await consumeTarball(item, packed, report.checks, consumerEntries(item.manifest, item.result.files), path.join(report.outputDirectory!, 'consumers', String(index)), 600_000, { env: options.env ?? process.env })
    item.result.status = item.result.diagnostics.some(diagnostic => diagnostic.severity === 'error') ? 'failed' : 'passed'
  }
  if (report.checks.some(check => check.status === 'failed')) {
    throw new Error(`Snapshot package validation failed: ${report.checks.filter(check => check.status === 'failed').map(check => `${check.name}: ${check.diagnostics.filter(item => item.severity === 'error').map(item => item.code).join(', ')}`).join('; ')}`)
  }
  report.status = 'prepared'
}
