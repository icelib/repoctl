import type { DocsCloudflareWorkersTarget, DocsSiteConfig } from '../../../../types/docs'
import { createHash } from 'node:crypto'
import { access, readFile } from 'node:fs/promises'
import { parse } from 'comment-json'
import path from 'pathe'
import { isRecord } from '../../../../core/config/validation/schema'
import { assertContainedPath, relativePath } from './paths'
import { assetDirectory, customDomains, staticFields, unsupported } from './shape'

export async function readCloudflareConfig(source: string, target: DocsCloudflareWorkersTarget) {
  if (!/^[a-f\d]{32}$/.test(target.accountId) || !/^[a-z\d][a-z\d-]{0,62}$/.test(target.workerName)
    || (target.environment !== undefined && !/^[\w-]+$/.test(target.environment))) {
    throw new Error('Cloudflare accountId, workerName or environment is invalid')
  }
  const filename = relativePath(source, target.config, 'Cloudflare config')
  if (!/\.jsonc?$/.test(filename)) {
    unsupported('config must be JSON or JSONC')
  }
  await assertContainedPath(source, filename)
  const bytes = await readFile(filename, 'utf8')
  let raw: unknown
  try {
    raw = parse(bytes)
  }
  catch {
    throw new Error('Cloudflare static config is not valid JSON or JSONC')
  }
  const root = staticFields(raw, true)
  const environment = target.environment ?? ''
  const selected = environment ? staticFields(isRecord(root['env']) ? root['env'][environment] : undefined) : root
  const effective = Object.fromEntries(['account_id', 'assets', 'route', 'routes'].map(key => [key, selected[key] ?? root[key]]))
  const name = selected['name'] ?? (environment && typeof root['name'] === 'string' ? `${root['name']}-${environment}` : root['name'])
  if (name !== target.workerName || (effective['account_id'] !== undefined && effective['account_id'] !== target.accountId)) {
    throw new Error('Cloudflare config does not match the frozen accountId and workerName')
  }
  if (environment && (root['route'] !== undefined || root['routes'] !== undefined) && selected['route'] === undefined && selected['routes'] === undefined) {
    unsupported('named environment must declare its own routes')
  }
  const domains = customDomains(effective)
  if (target.url) {
    const url = new URL(target.url)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/' || !domains.includes(url.hostname)) {
      throw new Error('Cloudflare documentation URL must match a configured HTTPS custom domain')
    }
  }
  const output = relativePath(path.dirname(filename), assetDirectory(effective['assets']), 'Cloudflare assets.directory')
  await assertContainedPath(source, output)
  const directories = new Set<string>()
  const rootDirectory = path.resolve(source)
  for (let directory = path.dirname(filename); ; directory = path.dirname(directory)) {
    directories.add(directory)
    if (directory === rootDirectory) {
      break
    }
  }
  for (const directory of directories) {
    try {
      await access(path.join(directory, '.wrangler/deploy/config.json'))
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue
      }
      throw error
    }
    unsupported('generated Wrangler configuration')
  }
  return { filename, output, domains, environment, digest: createHash('sha256').update(bytes).digest('hex'), target }
}

export async function preflightConfiguration(source: string, site: DocsSiteConfig, channel: 'preview' | 'stable') {
  const target = site[channel]
  if (target.provider !== 'cloudflare-workers') {
    throw new Error('Cloudflare provider target is required')
  }
  const current = await readCloudflareConfig(source, target)
  const other = site[channel === 'preview' ? 'stable' : 'preview']
  if (other.provider === 'cloudflare-workers') {
    if (other.accountId === target.accountId && other.workerName === target.workerName) {
      throw new Error('Preview and stable cannot deploy to the same Cloudflare Worker')
    }
    const sibling = await readCloudflareConfig(source, other)
    if (current.domains.some(domain => sibling.domains.includes(domain))) {
      throw new Error('Preview and stable Cloudflare Workers cannot own the same custom domain')
    }
  }
  return current
}

export type CloudflareConfiguration = Awaited<ReturnType<typeof readCloudflareConfig>>
