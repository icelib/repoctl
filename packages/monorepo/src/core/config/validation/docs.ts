import type { DocsCommandConfig, DocsDeploymentTarget, DocsSiteConfig } from '../../../types/docs'
import type { Schema } from './schema'
import { names, nonempty, object, record } from './schema'

const target = object({ deployScript: nonempty, url: nonempty } satisfies Record<keyof DocsDeploymentTarget, Schema>, ['deployScript'])
const site = object({
  packages: names,
  releaseInputs: record(names),
  buildScript: nonempty,
  preview: target,
  stable: target,
  patchPaths: names,
} satisfies Record<keyof DocsSiteConfig, Schema>, ['packages', 'buildScript', 'preview', 'stable', 'patchPaths'])

export const docsSchema = object({ sites: record(site) } satisfies Record<keyof DocsCommandConfig, Schema>)
