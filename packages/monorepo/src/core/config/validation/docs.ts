import type { DocsCommandConfig, DocsSiteConfig } from '../../../types/docs'
import type { Schema } from './schema'
import { choices, isRecord, names, nonempty, object, record, union } from './schema'

const milliseconds = (maximum: number): Schema => ({ expected: `integer milliseconds from 1 to ${maximum}`, accepts: value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= maximum })
const readiness = object({ timeoutMs: milliseconds(600_000), requestTimeoutMs: milliseconds(30_000) })
const script = { ...object({ deployScript: nonempty, url: nonempty, readiness }, ['deployScript']), accepts: (value: unknown) => isRecord(value) && value['provider'] === undefined }
const cloudflare = {
  ...object({ provider: choices('cloudflare-workers'), config: nonempty, workerName: nonempty, accountId: nonempty, environment: nonempty, url: nonempty, readiness }, ['provider', 'config', 'workerName', 'accountId']),
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
