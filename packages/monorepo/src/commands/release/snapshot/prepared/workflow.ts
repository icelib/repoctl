import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { valid } from 'semver'
import { packageDir, version } from '../../../../constants'

export interface SnapshotWorkflows {
  build: string
  publish: string
}

export interface SnapshotWorkflowOptions {
  /** Trusted pnpm pin matching the consumer workspace packageManager; defaults to 12.14.0. */
  pnpmVersion?: string
}

/** Export a matched, opt-in workflow pair with an exact trusted tool and builder policy. */
export async function getSnapshotWorkflows(options: SnapshotWorkflowOptions = {}): Promise<SnapshotWorkflows> {
  const pnpmVersion = options.pnpmVersion ?? '12.14.0'
  if (valid(pnpmVersion) !== pnpmVersion || !/^12\./.test(pnpmVersion)) {
    throw new Error('Snapshot workflows require an exact trusted pnpm 12 version.')
  }
  const directory = path.join(packageDir, 'resources/release-snapshot')
  const [buildTemplate, publishTemplate] = await Promise.all([
    readFile(path.join(directory, 'build.yml'), 'utf8'),
    readFile(path.join(directory, 'publish.yml'), 'utf8'),
  ])
  const build = buildTemplate.replaceAll('__VERSION__', version).replaceAll('__PNPM_VERSION__', pnpmVersion)
  const digest = createHash('sha256').update(build).digest('hex')
  const publish = publishTemplate.replaceAll('__VERSION__', version).replaceAll('__PNPM_VERSION__', pnpmVersion).replaceAll('__BUILDER_SHA256__', digest)
  return { build, publish }
}
