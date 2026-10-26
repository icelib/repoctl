import type { SnapshotWorkflowOptions } from './options'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { packageDir, version } from '../../../../../constants'
import { resolveSnapshotWorkflowOptions } from './options'

export type { SnapshotWorkflowOptions } from './options'

export interface SnapshotWorkflows {
  build: string
  publish: string
}

/** Export a matched, opt-in workflow pair with an exact trusted tool and builder policy. */
export async function getSnapshotWorkflows(options: SnapshotWorkflowOptions = {}): Promise<SnapshotWorkflows> {
  const configuration = resolveSnapshotWorkflowOptions(options)
  const directory = path.join(packageDir, 'resources/release-snapshot')
  const [buildTemplate, publishTemplate] = await Promise.all([
    readFile(path.join(directory, 'build.yml'), 'utf8'),
    readFile(path.join(directory, 'publish.yml'), 'utf8'),
  ])
  const replacements: Record<string, string> = {
    __VERSION__: version,
    __PNPM_VERSION__: configuration.pnpmVersion,
    __ENVIRONMENT__: JSON.stringify(configuration.environment),
    __BUILDER_WORKFLOW_PATH__: JSON.stringify(configuration.builderWorkflowPath),
    __PUBLISHER_WORKFLOW_PATH__: JSON.stringify(configuration.publisherWorkflowPath),
    __BUILDER_WORKFLOW_NAME__: JSON.stringify(configuration.builderWorkflowName),
    __PUBLISHER_WORKFLOW_NAME__: JSON.stringify(configuration.publisherWorkflowName),
  }
  // Replace once so literal names cannot become a second template expansion.
  const render = (template: string) => template.replace(/__[A-Z0-9_]+__/gu, placeholder => replacements[placeholder] ?? placeholder)
  const build = render(buildTemplate)
  replacements['__BUILDER_SHA256__'] = createHash('sha256').update(build).digest('hex')
  return { build, publish: render(publishTemplate) }
}
