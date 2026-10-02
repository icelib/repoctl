import type { WorkspaceManifest } from '@pnpm/workspace.read-manifest'

export type WorkspaceManifestLike = Partial<WorkspaceManifest> & Record<string, unknown>

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeQuotedString(value: string) {
  const trimmed = value.trim()
  const first = trimmed[0]
  if ((first === '\'' || first === '"') && trimmed.endsWith(first)) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

export function normalizeWorkspaceManifest(manifest: unknown): WorkspaceManifestLike {
  if (isPlainObject(manifest)) {
    return { ...manifest }
  }
  return {}
}

function mergeUniqueArray<T>(target: T[], source: T[]) {
  const seen = new Set(target.map((item) => {
    return typeof item === 'string' ? normalizeQuotedString(item) : item
  }))
  const result = [...target]
  for (const item of source) {
    const key = typeof item === 'string' ? normalizeQuotedString(item) : item
    if (!seen.has(key)) {
      seen.add(key)
      result.push(item)
    }
  }
  return result
}

/**
 * Merge pnpm workspace manifests by filling missing fields only.
 * Existing values take precedence; arrays are deduped while keeping target order.
 */
export function mergeWorkspaceManifest(source: WorkspaceManifestLike, target: WorkspaceManifestLike): WorkspaceManifestLike {
  const normalizedSource = normalizeWorkspaceManifest(source)
  const normalizedTarget = normalizeWorkspaceManifest(target)
  const result: WorkspaceManifestLike = { ...normalizedTarget }

  for (const [key, value] of Object.entries(normalizedSource)) {
    const current = (normalizedTarget as Record<string, unknown>)[key]
    if (current === undefined) {
      (result as Record<string, unknown>)[key] = value
      continue
    }

    if (Array.isArray(current) && Array.isArray(value)) {
      (result as Record<string, unknown>)[key] = mergeUniqueArray(current, value)
      continue
    }

    if (isPlainObject(current) && isPlainObject(value)) {
      (result as Record<string, unknown>)[key] = mergeWorkspaceManifest(
        value as WorkspaceManifestLike,
        current as WorkspaceManifestLike,
      )
      continue
    }

    (result as Record<string, unknown>)[key] = current
  }

  return result
}
