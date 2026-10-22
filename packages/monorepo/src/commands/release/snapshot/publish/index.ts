import type { SnapshotReport } from '../types'
import type { SnapshotPublicationOptions } from './registry'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { publishWithRetry } from '../../publish'
import { confirmSnapshotPublication, registryPresence } from './registry'

export async function publishSnapshotArtifacts(report: SnapshotReport, options: SnapshotPublicationOptions, checkpoint: () => Promise<void>) {
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
  // Resolve every candidate before uploading any: errors and collisions are never treated as absence.
  for (const pkg of report.packages) {
    pkg.published = await registryPresence(pkg, report, publishOptions)
  }
  await checkpoint()
  for (const pkg of report.packages) {
    if (pkg.published) {
      continue
    }
    await publishWithRetry(['publish', pkg.tarball!, '--ignore-scripts', '--no-git-checks', '--provenance', '--tag', report.tag, '--registry', report.registry], publishOptions, [pkg], true)
    // Confirmation can lag a successful upload; only its immutable evidence is polled.
    await confirmSnapshotPublication(pkg, report, publishOptions)
    pkg.published = true
    await checkpoint()
  }
  report.status = 'published'
}
