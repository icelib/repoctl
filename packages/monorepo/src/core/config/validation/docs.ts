import type { DocsCommandConfig, DocsSiteConfig } from '../../../types/docs'
import type { Schema } from './schema'
import { choices, isRecord, names, nonempty, object, record, union } from './schema'

const script = { ...object({ deployScript: nonempty, url: nonempty }, ['deployScript']), accepts: (value: unknown) => isRecord(value) && value['provider'] === undefined }
const cloudflare = {
  ...object({ provider: choices('cloudflare-workers'), config: nonempty, workerName: nonempty, accountId: nonempty, environment: nonempty, url: nonempty }, ['provider', 'config', 'workerName', 'accountId']),
  accepts: (value: unknown) => isRecord(value) && value['provider'] === 'cloudflare-workers',
}
const target = union(script, cloudflare)
const site = object({
  packages: names,
  releaseInputs: record(names),
  buildScript: nonempty,
  preview: target,
  stable: target,
  patchPaths: names,
} satisfies Record<keyof DocsSiteConfig, Schema>, ['packages', 'buildScript', 'preview', 'stable', 'patchPaths'])

export const docsSchema = object({ sites: record(site) } satisfies Record<keyof DocsCommandConfig, Schema>)
