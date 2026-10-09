import type { PublishedPackage, ReleaseOptions } from '../types'
import { performance } from 'node:perf_hooks'
import { logger } from '../../../core/logger'
import { ReleaseCommandError } from '../errors'
import { packageKey } from '../publish/state'
import { queryNpm } from './cli'
import { registryConfiguration } from './configuration'
import { registrySettings } from './settings'

export interface RegistryVersion {
  'version': string
  'gitHead'?: string
  'dist-tags'?: Record<string, string>
}

export function sleep(milliseconds: number, options: ReleaseOptions) {
  return options.sleep?.(milliseconds) ?? new Promise<void>(resolve => setTimeout(resolve, milliseconds))
}

class RetryableQuery extends Error {}
const clients = new WeakMap<ReleaseOptions, RegistryClient>()

export function registryClient(options: ReleaseOptions) {
  let client = clients.get(options)
  if (!client) {
    client = new RegistryClient(options)
    clients.set(options, client)
  }
  return client
}

class RegistryClient {
  private readonly versions = new Map<string, RegistryVersion>()
  private configuration?: ReturnType<typeof registryConfiguration>

  constructor(private readonly options: ReleaseOptions) {}

  private async publicHttp(name: string) {
    // A supplied legacy subprocess transport must remain deterministic for API consumers.
    if (this.options.spawn && !this.options.registryFetch) {
      return false
    }
    this.configuration ??= registryConfiguration(this.options)
    return (await this.configuration)(name)
  }

  private async http(url: string, timeout: number) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
      const response = await (this.options.registryFetch ?? globalThis.fetch)(url, { signal: controller.signal, redirect: 'error', headers: { 'accept': 'application/json', 'cache-control': 'no-cache' } })
      if (response.status === 404) {
        await response.body?.cancel()
        return undefined
      }
      if (!response.ok) {
        await response.body?.cancel()
        if ([401, 403].includes(response.status)) {
          throw new ReleaseCommandError(`npm authentication failed (HTTP ${response.status}); check registry permissions`)
        }
        if (response.status === 429 || response.status >= 500) {
          throw new RetryableQuery(`HTTP ${response.status}`)
        }
        throw new ReleaseCommandError(`npm registry query failed (HTTP ${response.status}); registry state is unknown`)
      }
      return await response.json() as unknown
    }
    catch (error) {
      if (error instanceof ReleaseCommandError || error instanceof RetryableQuery) {
        throw error
      }
      throw new RetryableQuery(controller.signal.aborted ? `request timed out after ${timeout}ms` : error instanceof Error ? error.name : 'network error')
    }
    finally {
      clearTimeout(timer)
    }
  }

  async inspect(pkg: PublishedPackage, deadline: number, fields: 'version' | 'metadata' = 'metadata'): Promise<RegistryVersion | undefined> {
    const settings = registrySettings(this.options)
    const http = await this.publicHttp(pkg.name)
    let reason = 'request deadline exhausted'
    for (let attempt = 0; attempt < 3; attempt++) {
      const timeout = Math.floor(Math.min(settings.requestTimeoutMs, deadline - performance.now()))
      if (timeout <= 0) {
        break
      }
      try {
        let data: unknown
        if (http) {
          const name = encodeURIComponent(pkg.name)
          data = this.versions.get(packageKey(pkg)) ?? await this.http(`https://registry.npmjs.org/${name}/${encodeURIComponent(pkg.version)}`, timeout)
          if (data === undefined) {
            return undefined
          }
          if (!data || typeof data !== 'object' || (data as RegistryVersion).version !== pkg.version) {
            throw new ReleaseCommandError(`npm returned invalid metadata for ${packageKey(pkg)}; registry state is unknown`)
          }
          this.versions.set(packageKey(pkg), data as RegistryVersion)
          if (fields === 'metadata') {
            const remaining = Math.floor(Math.min(settings.requestTimeoutMs, deadline - performance.now()))
            if (remaining <= 0) {
              throw new RetryableQuery('dist-tag request deadline exhausted')
            }
            const tags = await this.http(`https://registry.npmjs.org/-/package/${name}/dist-tags`, remaining)
            data = { ...(data as object), 'dist-tags': tags ?? {} }
          }
        }
        else {
          const result = await queryNpm(['view', packageKey(pkg), ...(fields === 'version' ? ['version'] : ['--json'])], timeout, this.options)
          const output = `${String(result.stdout ?? '')}\n${String(result.stderr ?? '')}`
          if (result.status !== 0) {
            if (!result.error && /\bE404\b/.test(output)) {
              return undefined
            }
            if (/\b(?:E401|E403|ENEEDAUTH)\b/.test(output)) {
              throw new ReleaseCommandError(`npm authentication failed for ${packageKey(pkg)}`)
            }
            throw new RetryableQuery(result.error?.name ?? (output.match(/\b(?:E[A-Z]+|429|5\d\d)\b/)?.[0] ?? 'npm query failed'))
          }
          data = fields === 'version' ? { version: String(result.stdout).trim() } : JSON.parse(String(result.stdout))
        }
        if (!data || typeof data !== 'object' || (data as RegistryVersion).version !== pkg.version) {
          throw new ReleaseCommandError(`npm returned invalid metadata for ${packageKey(pkg)}; registry state is unknown`)
        }
        return data as RegistryVersion
      }
      catch (error) {
        if (!(error instanceof RetryableQuery)) {
          throw error
        }
        reason = error.message
        logger.warn(`Registry query ${packageKey(pkg)}: ${reason} (attempt ${attempt + 1}/3)`)
        const delay = Math.min(1_000 * 2 ** attempt, Math.max(0, deadline - performance.now()))
        if (attempt < 2 && delay) {
          await sleep(delay, this.options)
          // Account for injected waits without extending the uniform deadline.
          if (this.options.sleep) {
            deadline -= delay
          }
        }
      }
    }
    throw new ReleaseCommandError(`npm registry state is unknown for ${packageKey(pkg)} after bounded retries; no upload attempted (${reason})`)
  }
}
