import type { TemplateRemoteSource } from '@icebreakers/monorepo-templates'
import type { ResolvedTemplateSource, TemplateSourceManifest, TemplateSourceOptions } from './types'
import { copyFile, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { digestBytes, extractTemplateArchive, verifyArchiveIntegrity } from './archive'
import { cachedTemplateDirectory, readTemplateSourceCache, withTemplateSourceLock } from './cache'
import { downloadGitTemplate } from './git'
import { normalizeTemplateSourceRequest, sourceRequestKey } from './request'

export type { ResolvedTemplateSource, TemplateSourceOptions, TemplateSourceRequest } from './types'

/** Prepare verified assets only. Never installs dependencies, executes remote scripts or writes the target workspace. */
export async function resolveRemoteTemplateSource(source: TemplateRemoteSource, templatePath = '.', options: TemplateSourceOptions = {}): Promise<ResolvedTemplateSource> {
  const request = normalizeTemplateSourceRequest(source, templatePath)
  const cwd = path.resolve(options.cwd ?? process.cwd())
  const npm = request.source.kind === 'npm' ? await import('./npm') : undefined
  const configuration = request.source.kind === 'npm' ? await npm!.npmTemplateConfiguration(request.source, cwd) : undefined
  if (request.source.kind === 'npm') {
    request.source.registry = configuration!.registry
  }
  const cacheDir = path.resolve(cwd, options.cacheDir ?? path.join(process.env['XDG_CACHE_HOME'] ?? path.join(homedir(), '.cache'), 'repoctl', 'template-sources-v1'))
  const timeout = options.timeoutMs ?? 120_000
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error('Template source timeoutMs must be positive.')
  }
  const key = sourceRequestKey(request)
  const directory = path.join(cacheDir, key)
  const existing = await readTemplateSourceCache(directory, request)
  if (existing) {
    return { sourceDir: await cachedTemplateDirectory(directory, templatePath), request, resolved: existing.resolved, digest: existing.digest, cache: 'hit' }
  }
  if (options.offline) {
    throw new Error('The exact template source is not in the verified cache. Fetch this same source online before using --offline; no target files were created.')
  }
  await mkdir(cacheDir, { recursive: true })
  return withTemplateSourceLock(path.join(cacheDir, `${key}.lock`), async () => {
    const concurrent = await readTemplateSourceCache(directory, request)
    if (concurrent) {
      return { sourceDir: await cachedTemplateDirectory(directory, templatePath), request, resolved: concurrent.resolved, digest: concurrent.digest, cache: 'hit' }
    }
    const temporary = await mkdtemp(path.join(cacheDir, `${key}-download-`))
    try {
      const fetchDir = path.join(temporary, 'fetch')
      await mkdir(fetchDir)
      const downloaded = request.source.kind === 'npm'
        ? await npm!.downloadNpmTemplate(request.source, fetchDir, cwd, timeout, configuration!)
        : await downloadGitTemplate(request.source, fetchDir, timeout)
      if ((await lstat(downloaded.archive)).size > 64 * 1024 * 1024) {
        throw new Error('Template archive exceeds 64 MiB.')
      }
      const archive = await readFile(downloaded.archive)
      verifyArchiveIntegrity(archive, downloaded.resolved.integrity)
      const archiveFile = path.join(temporary, 'archive.tgz')
      await copyFile(downloaded.archive, archiveFile)
      const digest = await extractTemplateArchive(archiveFile, path.join(temporary, 'assets'), downloaded.prefix)
      await cachedTemplateDirectory(temporary, templatePath)
      const manifest: TemplateSourceManifest = { schemaVersion: 1, request, resolved: downloaded.resolved, digest, archiveDigest: digestBytes(archive) }
      await writeFile(path.join(temporary, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
      await rm(fetchDir, { recursive: true, force: true })
      await rename(temporary, directory)
      return { sourceDir: await cachedTemplateDirectory(directory, templatePath), request, resolved: downloaded.resolved, digest, cache: 'downloaded' }
    }
    finally {
      await rm(temporary, { recursive: true, force: true })
    }
  })
}
