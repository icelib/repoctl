import type { WorkspaceManifestLike } from './merge'
import { Buffer } from 'node:buffer'
import { isDeepStrictEqual } from 'node:util'
import YAML from 'yaml'
import { parseWorkspaceManifest, validateWorkspaceManifestContent } from '../../../core/workspace/manifest'
import { mergeWorkspaceManifest, normalizeWorkspaceManifest } from './merge'

/** Serialize only when pnpm reads back the same values and types. */
export function serializeWorkspaceManifest(manifest: WorkspaceManifestLike): Buffer {
  const content = YAML.stringify(manifest, { version: '1.2', schema: 'core', singleQuote: true })
  validateWorkspaceManifestContent(content, manifest)
  return Buffer.from(content)
}

/** Plan workspace defaults using the same manifest values as pnpm discovery. */
export function getWorkspaceUpgradeContent(source: Buffer, before: Buffer | undefined): Buffer {
  const sourceManifest = normalizeWorkspaceManifest(parseWorkspaceManifest(source.toString('utf8')).manifest)
  if (before === undefined) {
    return serializeWorkspaceManifest(sourceManifest)
  }

  const target = parseWorkspaceManifest(before.toString('utf8'))
  const targetManifest = normalizeWorkspaceManifest(target.manifest)
  const hasDocument = target.document.contents !== null
  // Omitted packages in an existing document already discover all packages.
  // Adding managed defaults would narrow that pnpm selection. Empty files
  // need initialization before pnpm can read them, just like missing files.
  if (hasDocument && target.patterns === undefined) {
    delete sourceManifest.packages
  }

  const merged = mergeWorkspaceManifest(sourceManifest, targetManifest)
  return hasDocument && isDeepStrictEqual(merged, targetManifest)
    ? before
    : serializeWorkspaceManifest(merged)
}
