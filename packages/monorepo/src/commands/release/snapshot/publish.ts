import type { SnapshotOptions, SnapshotPackage, SnapshotReport } from './types'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import crossSpawn from 'cross-spawn'
import { publishWithRetry } from '../publish'
import { matchesSnapshotMetadata } from './identity'

function registryPresence(pkg: SnapshotPackage, report: SnapshotReport, options: SnapshotOptions) {
  const result = (options.spawn ?? crossSpawn.sync)('npm', ['view', `${pkg.name}@${pkg.version}`, '--json', '--registry', report.registry], {
    cwd: options.cwd,
    env: { ...(options.env ?? process.env), npm_config_registry: report.registry },
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  })
  if (result.status !== 0) {
    if (!result.error && /\bE404\b/.test(result.stderr?.toString() ?? '')) {
      return false
    }
    throw new Error(`Snapshot registry state is unknown for ${pkg.name}@${pkg.version}; no upload can be retried safely.`)
  }
  const metadata = JSON.parse(result.stdout?.toString() ?? '')
  if (metadata.name !== pkg.name || metadata.version !== pkg.version || metadata.dist?.integrity !== pkg.integrity
    || !matchesSnapshotMetadata(metadata.repoctlSnapshot, report)) {
    throw new Error(`Snapshot identity or tarball integrity already conflicts at ${pkg.name}@${pkg.version}. Use a new buildId for a changed build.`)
  }
  return true
}

export async function publishSnapshotArtifacts(report: SnapshotReport, options: SnapshotOptions, checkpoint: () => Promise<void>) {
  const cwd = path.join(report.outputDirectory!, 'publication')
  await mkdir(cwd)
  await writeFile(path.join(cwd, 'package.json'), '{"name":"repoctl-snapshot-publication","private":true}\n')
  await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), 'packages: []\n')
  const publishOptions = {
    ...options,
    cwd,
    quiet: true,
    env: { ...(options.env ?? process.env), npm_config_registry: report.registry },
  }
  // Resolve every candidate before uploading any: E401, network failures and collisions are never treated as absence.
  for (const pkg of report.packages) {
    pkg.published = registryPresence(pkg, report, publishOptions)
  }
  await checkpoint()
  for (const pkg of report.packages) {
    if (pkg.published) {
      continue
    }
    await publishWithRetry(['publish', pkg.tarball!, '--ignore-scripts', '--no-git-checks', '--provenance', '--tag', report.tag, '--registry', report.registry], publishOptions, [pkg], true)
    pkg.published = registryPresence(pkg, report, publishOptions)
    if (!pkg.published) {
      throw new Error(`Published snapshot metadata is not visible for ${pkg.name}@${pkg.version}.`)
    }
    await checkpoint()
  }
  report.status = 'published'
}
