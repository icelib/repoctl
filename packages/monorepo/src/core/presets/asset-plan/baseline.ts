import type { OrganizationPresetAsset } from '../../../types/presets'
import { Buffer } from 'node:buffer'
import { hash } from '../../file-transaction/paths'
import { presetAssetTarget } from '../assets'
import { parsePresetJson, presetRelativePath } from '../files'
import { presetPackageName, presetVersion } from '../reference'

interface PresetAssetBaseline {
  schemaVersion: 1
  path: string
  source: { packageName: string, version: string, path: string }
  upstream: { hash: string, content: string }
}

/** A separate provider record; never adopts or broadens repoctl's root baseline ownership. */
export const presetBaselinePath = (target: string) => `.repoctl/baselines/presets/${hash(Buffer.from(target))}.json`

export function parsePresetBaseline(content: Buffer, filename: string): PresetAssetBaseline {
  const value = parsePresetJson(content, filename) as PresetAssetBaseline
  if (!value || value.schemaVersion !== 1 || typeof value.path !== 'string' || presetAssetTarget(value.path) !== value.path
    || filename !== presetBaselinePath(value.path) || !value.source || !presetPackageName.accepts(value.source.packageName)
    || !presetVersion.accepts(value.source.version) || typeof value.source.path !== 'string' || !presetRelativePath(value.source.path)
    || !value.upstream || typeof value.upstream.content !== 'string'
    || Buffer.from(value.upstream.content, 'base64').toString('base64') !== value.upstream.content
    || hash(Buffer.from(value.upstream.content, 'base64')) !== value.upstream.hash) {
    throw new Error(`Invalid organization preset asset baseline: ${filename}`)
  }
  return value
}

export function encodePresetBaseline(asset: OrganizationPresetAsset, source: { packageName: string, version: string }, content: Buffer) {
  const record: PresetAssetBaseline = { schemaVersion: 1, path: asset.target, source: { packageName: source.packageName, version: source.version, path: asset.source }, upstream: { hash: hash(content), content: content.toString('base64') } }
  return Buffer.from(`${JSON.stringify(record, null, 2)}\n`)
}
