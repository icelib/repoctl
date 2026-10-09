import type { PublishedPackage, ReleaseOptions } from '../types'
import { performance } from 'node:perf_hooks'
import { registryClient } from '../registry'
import { registrySettings } from '../registry/settings'

export type { RegistryVersion } from '../registry'

/** Only an explicit 404 proves absence; unknown state must never cause an upload. */
export function inspectRegistry(pkg: PublishedPackage, options: ReleaseOptions, deadline?: number) {
  const settings = registrySettings(options)
  return registryClient(options).inspect(pkg, deadline ?? performance.now() + Math.min(settings.visibilityTimeoutMs, settings.requestTimeoutMs * 6 + 3_000))
}
