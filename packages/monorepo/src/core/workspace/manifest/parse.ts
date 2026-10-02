import { validateWorkspaceManifest } from '@pnpm/workspace.read-manifest'
import { load } from 'js-yaml'
import YAML from 'yaml'
import { validateWorkspacePackagePatterns } from '../patterns'

/** Internal classification for stable migration reasons, independent of text. */
export class WorkspacePatternsError extends TypeError {
  readonly code = 'INVALID_WORKSPACE_PATTERNS'
}

/** Validate the explicit rules while retaining pnpm's implicit default state. */
export function getWorkspaceManifestPatterns(manifest: unknown): string[] | undefined {
  if (manifest === null) {
    return undefined
  }
  if (typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new TypeError('pnpm-workspace.yaml must contain a mapping.')
  }
  const packages = (manifest as { packages?: unknown }).packages
  if (packages === undefined) {
    return undefined
  }
  if (!Array.isArray(packages) || packages.some(item => typeof item !== 'string')) {
    throw new WorkspacePatternsError('pnpm-workspace.yaml packages must be an array of strings.')
  }
  const patterns = packages as string[]
  try {
    validateWorkspacePackagePatterns(patterns)
  }
  catch (error) {
    throw new WorkspacePatternsError(error instanceof Error ? error.message : String(error), { cause: error })
  }
  return patterns
}

/** Parse a writable YAML document without discarding comments or formatting. */
export function parseWorkspaceManifest(source: string) {
  // pnpm's read-yaml-file reader uses js-yaml's core schema, even when a
  // version directive says YAML 1.1. Use the same reader for values and tag
  // validation; keep a core-schema AST only for comment-preserving edits.
  const document = YAML.parseDocument(source, {
    schema: 'core',
    merge: false,
    resolveKnownTags: false,
    customTags: [{
      // yaml's core !!int resolver cannot round-trip pnpm's signed binary
      // integers. Delegate explicit integers to the reader as well; default:
      // false keeps untagged binary-looking values as ordinary strings.
      tag: 'tag:yaml.org,2002:int',
      default: false,
      resolve(value: string, onError: (message: string) => void) {
        try {
          return load(`!!int ${JSON.stringify(value)}`)
        }
        catch (error) {
          onError(error instanceof Error ? error.message : String(error))
          return null
        }
      },
      stringify: item => String(item.value),
    }],
  })
  if (document.errors.length) {
    throw new Error(`Invalid pnpm-workspace.yaml: ${document.errors[0]!.message}`)
  }
  let manifest: unknown
  try {
    // Preserve initialization of missing/blank documents, which pnpm's reader
    // rejects but init fills before any subsequent package discovery.
    manifest = document.contents === null ? null : load(source)
  }
  catch (error) {
    throw new Error(`Invalid pnpm-workspace.yaml: ${error instanceof Error ? error.message : String(error)}`)
  }
  const patterns = getWorkspaceManifestPatterns(manifest)
  try {
    // Planning must reject the same catalog structures as pnpm discovery,
    // before init creates files or create commits a package and its rules.
    validateWorkspaceManifest(manifest)
  }
  catch (error) {
    throw new Error(`Invalid pnpm-workspace.yaml: ${error instanceof Error ? error.message : String(error)}`)
  }
  return { document, patterns, manifest }
}
