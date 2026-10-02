import type { ResolvedTemplateRemoteSource, TemplateRemoteSource } from '@icebreakers/monorepo-templates'
import { createWriteStream } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import Config from '@npmcli/config'
import definitionsModule from '@npmcli/config/lib/definitions/index.js'
import pacote from 'pacote'
import { registryUrl } from './request'

const require = createRequire(import.meta.url)

export async function npmTemplateConfiguration(source: Extract<TemplateRemoteSource, { kind: 'npm' }>, cwd: string) {
  const config = new Config({ ...definitionsModule, npmPath: path.dirname(require.resolve('@npmcli/config/package.json')), argv: [], cwd })
  try {
    await config.load()
    if (!config.validate()) {
      throw new Error('Invalid configuration.')
    }
  }
  catch {
    throw new Error('Could not read valid npm configuration; check registry and scoped authentication in .npmrc.')
  }
  const scope = source.packageName.startsWith('@') ? source.packageName.split('/')[0] : undefined
  const registry = registryUrl(source.registry ?? (scope ? config.flat[`${scope}:registry`] : undefined) ?? config.flat['registry'])
  return { registry, options: { ...config.flat, registry, ...(scope ? { [`${scope}:registry`]: registry } : {}) } }
}

export async function downloadNpmTemplate(source: Extract<TemplateRemoteSource, { kind: 'npm' }>, directory: string, cwd: string, timeout: number, configuration: Awaited<ReturnType<typeof npmTemplateConfiguration>>): Promise<{ archive: string, prefix: string, resolved: ResolvedTemplateRemoteSource }> {
  try {
    // Authentication remains in memory and pacote's disposable fetch cache.
    const options = { ...configuration.options, where: cwd, cache: path.join(directory, 'npm-cache'), ignoreScripts: true, fetchTimeout: timeout, fetchRetries: 0, retry: { retries: 0 } }
    const specifier = `${source.packageName}@${source.version}`
    const resolved = await pacote.manifest(specifier, options)
    const integrity = resolved.dist?.integrity ?? resolved._integrity
    if (resolved.name !== source.packageName || resolved.version !== source.version || typeof integrity !== 'string' || !integrity) {
      throw new Error('The registry did not provide the requested version and integrity.')
    }
    const archive = path.join(directory, 'archive.tgz')
    await pacote.tarball.stream(specifier, async (stream) => {
      await pipeline(stream, async function* limit(source) {
        let bytes = 0
        for await (const chunk of source) {
          bytes += chunk.length
          if (bytes > 64 * 1024 * 1024) {
            throw new Error('Template archive exceeds 64 MiB.')
          }
          yield chunk
        }
      }, createWriteStream(archive), { signal: AbortSignal.timeout(timeout) })
    }, { ...options, integrity })
    return { archive, prefix: 'package', resolved: { kind: 'npm', packageName: source.packageName, requestedVersion: source.version, version: resolved.version, registry: configuration.registry, integrity } }
  }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EINTEGRITY') {
      throw new Error('npm template integrity verification failed; no target files were created.')
    }
    throw new Error('npm template download failed. Verify the exact version, registry and scoped authentication in .npmrc, and network access; no target files were created.')
  }
}
