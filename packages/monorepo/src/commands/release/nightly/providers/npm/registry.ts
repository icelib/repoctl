import type { NightlyOptions } from '../../types'
import { valid } from 'semver'

const registry = 'https://registry.npmjs.org/'
export const nightlyTag = 'snapshot-nightly'

export interface RegistryMetadata {
  name: string
  version: string
  repoctlSnapshot?: unknown
  dist?: { integrity?: string }
}
interface Publication { latest: string | null, version: string | null, metadata: RegistryMetadata | null }

export function registryObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function createNightlyRegistry(options: NightlyOptions) {
  async function request(pathname: string, deadline = Number.POSITIVE_INFINITY) {
    const timeout = Math.min(10_000, deadline - Date.now())
    if (timeout <= 0) {
      throw new Error('Nightly registry confirmation timed out.')
    }
    let response: Response
    try {
      response = await (options.registryFetch ?? fetch)(new URL(pathname, registry), { redirect: 'error', headers: { 'accept': 'application/json', 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(Math.max(1, Math.floor(timeout))) })
    }
    catch {
      throw new Error(`Nightly registry request failed for ${pathname}; publication state is unknown.`)
    }
    if (response.status === 404) {
      await response.body?.cancel()
      return null
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(`Nightly registry returned HTTP ${response.status} for ${pathname}; publication state is unknown.`)
    }
    const value: unknown = await response.json().catch(() => null)
    if (!registryObject(value)) {
      throw new Error(`Nightly registry returned invalid metadata for ${pathname}.`)
    }
    return value
  }
  return {
    async versions(name: string): Promise<RegistryMetadata[]> {
      const metadata = await request(encodeURIComponent(name))
      if (!metadata) {
        return []
      }
      if (metadata['name'] !== name || !registryObject(metadata['versions'])) {
        throw new Error(`Nightly registry returned invalid version history for ${name}.`)
      }
      return Object.entries(metadata['versions']).map(([version, entry]) => {
        if (!valid(version) || !registryObject(entry) || entry['name'] !== name || entry['version'] !== version) {
          throw new Error(`Nightly registry version history does not match ${name}@${version}.`)
        }
        return entry as unknown as RegistryMetadata
      })
    },
    async publication(name: string, allowMissingVersion = false, deadline?: number): Promise<Publication> {
      const tags = await request(`-/package/${encodeURIComponent(name)}/dist-tags`, deadline)
      if (tags && Object.values(tags).some(value => typeof value !== 'string' || !value)) {
        throw new Error(`Nightly registry returned invalid dist-tags for ${name}.`)
      }
      const version = tags?.[nightlyTag] as string | undefined
      const metadata = version ? await request(`${encodeURIComponent(name)}/${encodeURIComponent(version)}`, deadline) : null
      if (version && !metadata && !allowMissingVersion) {
        throw new Error(`Nightly tag for ${name} points at unavailable metadata; publication state is unknown.`)
      }
      if (metadata && (metadata['name'] !== name || metadata['version'] !== version)) {
        throw new Error(`Nightly registry metadata does not match ${name}@${version}.`)
      }
      return { latest: tags?.['latest'] as string | undefined ?? null, version: version ?? null, metadata: metadata as RegistryMetadata | null }
    },
  }
}
