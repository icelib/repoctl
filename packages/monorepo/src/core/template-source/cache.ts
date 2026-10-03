import type { ResolvedTemplateRemoteSource } from '@icebreakers/monorepo-templates'
import type { TemplateSourceManifest, TemplateSourceRequest } from './types'
import { lstat, open, readFile, realpath, unlink } from 'node:fs/promises'
import path from 'node:path'
import { digestBytes, hashAssetDirectory, hashTemplateArchive, verifyArchiveIntegrity } from './archive'

function resolvedIdentity(value: unknown, request: TemplateSourceRequest): ResolvedTemplateRemoteSource {
  const data = value as Record<string, unknown> | null
  if (!data || typeof data['integrity'] !== 'string') {
    throw new Error('Invalid source integrity.')
  }
  const source = request.source
  if (data['kind'] === 'npm' && source.kind === 'npm' && data['packageName'] === source.packageName && data['requestedVersion'] === source.version && data['version'] === source.version && typeof data['registry'] === 'string' && data['registry'] === source.registry) {
    return { kind: 'npm', packageName: source.packageName, requestedVersion: source.version, version: source.version, registry: data['registry'], integrity: data['integrity'] }
  }
  if (data['kind'] === 'git' && source.kind === 'git' && data['repository'] === source.repository && data['requestedRef'] === source.ref && typeof data['commit'] === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(data['commit'])) {
    if (/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/iu.test(source.ref) && source.ref.toLowerCase() !== data['commit']) {
      throw new Error('Cached Git commit does not match the requested commit.')
    }
    return { kind: 'git', repository: source.repository, requestedRef: source.ref, commit: data['commit'], integrity: data['integrity'] }
  }
  throw new Error('Cached source does not match its request.')
}

export async function readTemplateSourceCache(directory: string, request: TemplateSourceRequest): Promise<TemplateSourceManifest | undefined> {
  const stat = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return undefined
    }
    throw error
  })
  if (!stat) {
    return undefined
  }
  try {
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error('Invalid cache directory.')
    }
    for (const name of ['manifest.json', 'archive.tgz']) {
      const file = await lstat(path.join(directory, name))
      if (!file.isFile() || file.isSymbolicLink() || file.nlink > 1) {
        throw new Error('Invalid cache file.')
      }
    }
    const data = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')) as TemplateSourceManifest
    if (data.schemaVersion !== 1 || JSON.stringify(data.request) !== JSON.stringify(request) || !/^[a-f0-9]{64}$/u.test(data.digest) || !/^[a-f0-9]{64}$/u.test(data.archiveDigest)) {
      throw new Error('Invalid cache manifest.')
    }
    const resolved = resolvedIdentity(data.resolved, request)
    if ((await lstat(path.join(directory, 'archive.tgz'))).size > 64 * 1024 * 1024) {
      throw new Error('Cached archive exceeds 64 MiB.')
    }
    const archive = await readFile(path.join(directory, 'archive.tgz'))
    verifyArchiveIntegrity(archive, resolved.integrity)
    const expected = await hashTemplateArchive(path.join(directory, 'archive.tgz'), resolved.kind === 'npm' ? 'package' : 'template')
    if (digestBytes(archive) !== data.archiveDigest || expected !== data.digest || await hashAssetDirectory(path.join(directory, 'assets')) !== expected) {
      throw new Error('Cache content changed.')
    }
    return { schemaVersion: 1, request, resolved, digest: data.digest, archiveDigest: data.archiveDigest }
  }
  catch {
    throw new Error(`Template cache failed integrity verification at ${directory}. Remove this cache entry deliberately and retry online; no target files were created.`)
  }
}

export async function cachedTemplateDirectory(directory: string, templatePath: string) {
  const root = await realpath(path.join(directory, 'assets'))
  const sourceDir = path.resolve(root, templatePath)
  if (sourceDir !== root && !sourceDir.startsWith(`${root}${path.sep}`)) {
    throw new Error('Template path escapes its cache.')
  }
  const stat = await lstat(sourceDir).catch(() => undefined)
  if (!stat?.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`The remote asset does not contain template directory ${templatePath}; no target files were created.`)
  }
  return sourceDir
}

export async function withTemplateSourceLock<T>(file: string, run: () => Promise<T>): Promise<T> {
  const handle = await open(file, 'wx', 0o600).catch(() => {
    throw new Error(`Template cache is being populated or has a stale lock at ${file}. Retry after the writer finishes; remove a stale lock only after confirming the writer stopped.`)
  })
  const identity = await handle.stat()
  try {
    return await run()
  }
  finally {
    await handle.close()
    const current = await lstat(file).catch(() => undefined)
    if (current?.dev === identity.dev && current.ino === identity.ino) {
      await unlink(file)
    }
  }
}
