import type { DocsSiteConfig } from '../../types/docs'
import type { DocsOptions } from './types'
import process from 'node:process'
import { resolveCommandConfig } from '../../core/config'
import { resolveCommandValues } from '../../core/config/resolution'
import { GitHubClient } from '../release/github'

export function assertPatterns(patterns: string[], label: string) {
  if (!patterns.length || !patterns.some(value => !value.startsWith('!'))) {
    throw new Error(`${label} requires at least one positive repository-relative glob`)
  }
  for (const pattern of patterns) {
    const value = pattern.replace(/^!/, '')
    if (!value || value.startsWith('/') || value.includes('\\') || value.split('/').some(part => part === '..' || part === '.') || /^[a-z]:/i.test(value)) {
      throw new Error(`${label} must contain repository-relative globs without path traversal`)
    }
  }
}

export function validateSite(site: DocsSiteConfig) {
  if (!site.packages.length || new Set(site.packages).size !== site.packages.length) {
    throw new Error('Documentation packages must be a nonempty list of unique package names')
  }
  if (site.patchPaths.length) {
    assertPatterns(site.patchPaths, 'patchPaths')
  }
  for (const [name, patterns] of Object.entries(site.releaseInputs ?? {})) {
    assertPatterns(patterns, `releaseInputs.${name}`)
  }
  for (const target of [site.preview, site.stable]) {
    if (target.url && !/^https?:\/\//.test(target.url)) {
      throw new Error('Documentation URLs must use http or https')
    }
  }
}

export async function docsContext(options: DocsOptions) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(options.site)) {
    throw new Error('Documentation site IDs must use lowercase letters, digits and hyphens')
  }
  if (!['preview', 'stable'].includes(options.channel)) {
    throw new Error('Documentation channel must be preview or stable')
  }
  const env = options.env ?? process.env
  const repository = env['GITHUB_REPOSITORY']
  if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new Error('GITHUB_REPOSITORY is required for documentation deployment identity')
  }
  const config = options.config === undefined
    ? await resolveCommandConfig('docs', options.cwd)
    : resolveCommandValues('docs', options.config).values
  const site = config?.sites?.[options.site]
  if (!site) {
    throw new Error(`Documentation site ${options.site} is not configured`)
  }
  validateSite(site)
  const github = options.github ?? new GitHubClient({
    repository,
    ...(env['GITHUB_TOKEN'] ? { token: env['GITHUB_TOKEN'] } : {}),
    ...(env['GITHUB_API_URL'] ? { apiUrl: env['GITHUB_API_URL'] } : {}),
  })
  return { env, repository, site, github, key: `docs/${options.site}/${options.channel}` }
}

export type DocsContext = Awaited<ReturnType<typeof docsContext>>
