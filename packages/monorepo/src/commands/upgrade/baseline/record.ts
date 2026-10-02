import { Buffer } from 'node:buffer'
import { toWorkspaceAssetPath } from '../../../utils'
import { hash, relativeFile } from '../plan/files'
import { getAssetTargets } from '../targets'

export const baselineDirectory = '.repoctl/baselines/root'
export const templatePackage = '@icebreakers/monorepo-templates'

export interface RootAssetBaseline {
  schemaVersion: 1
  path: string
  source: { package: typeof templatePackage, version: string, assetPath: string, hash: string }
  upstream: { hash: string, content: string }
}

export function isRootAsset(filename: string) {
  return getAssetTargets().some(target => filename === target || filename.startsWith(`${target}/`))
}

export const baselinePath = (filename: string) => `${baselineDirectory}/${hash(Buffer.from(filename))}.json`
export const encodeBaseline = (record: RootAssetBaseline) => Buffer.from(`${JSON.stringify(record, null, 2)}\n`)

export function parseBaseline(content: Buffer, filename: string): RootAssetBaseline {
  const record = JSON.parse(content.toString()) as RootAssetBaseline
  if (!record || record.schemaVersion !== 1 || typeof record.path !== 'string' || !isRootAsset(relativeFile(record.path))
    || filename !== baselinePath(record.path) || !record.source || record.source.package !== templatePackage
    || typeof record.source.version !== 'string' || !record.source.version
    || typeof record.source.assetPath !== 'string' || !relativeFile(record.source.assetPath)
    || toWorkspaceAssetPath(record.source.assetPath) !== record.path
    || !/^[\da-f]{64}$/.test(record.source.hash) || !record.upstream || typeof record.upstream.content !== 'string'
    || Buffer.from(record.upstream.content, 'base64').toString('base64') !== record.upstream.content
    || hash(Buffer.from(record.upstream.content, 'base64')) !== record.upstream.hash) {
    throw new Error(`Invalid root asset baseline: ${filename}`)
  }
  return record
}
