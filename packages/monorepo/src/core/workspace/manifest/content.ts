import { isDeepStrictEqual } from 'node:util'
import { parseWorkspaceManifest } from './parse'

/** Refuse any write that would change the planned pnpm values or types. */
export function validateWorkspaceManifestContent(content: string, expected: unknown) {
  const parsed = parseWorkspaceManifest(content)
  if (!isDeepStrictEqual(parsed.manifest, expected)) {
    throw new Error('Serializing pnpm-workspace.yaml changed manifest values or types.')
  }
}
