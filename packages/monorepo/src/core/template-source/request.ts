import type { TemplateRemoteSource } from '@icebreakers/monorepo-templates'
import type { TemplateSourceRequest } from './types'
import { createHash } from 'node:crypto'
import { valid } from 'semver'
import validatePackageName from 'validate-npm-package-name'

function gitRef(value: string) {
  return Boolean(value) && value !== '@' && !/[\s\p{Cc}]/u.test(value) && !['~', '^', ':', '?', '*', '[', '\\'].some(character => value.includes(character)) && !value.startsWith('-') && !value.includes('..') && !value.includes('@{') && !value.endsWith('.') && value.split('/').every(part => part && !part.startsWith('.') && !part.endsWith('.lock'))
}

export function templateSourcePath(value: string) {
  if (value === '.') {
    return value
  }
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes(':') || value.includes('\0') || value.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Remote template source must be a portable relative directory, or . for the archive root.')
  }
  return value
}

export function registryUrl(value: unknown) {
  let url: URL
  try {
    url = new URL(String(value))
  }
  catch {
    throw new Error('npm registry must be an HTTP or HTTPS URL without embedded credentials.')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('npm registry must be an HTTP or HTTPS URL without embedded credentials.')
  }
  return url.href.endsWith('/') ? url.href : `${url.href}/`
}

export function normalizeTemplateRemoteSource(value: unknown): TemplateRemoteSource {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Template remote source must be an npm or Git declaration.')
  }
  const source = value as Record<string, unknown>
  if (source['kind'] === 'npm') {
    if (Object.keys(source).some(key => !['kind', 'packageName', 'version', 'registry'].includes(key)) || typeof source['packageName'] !== 'string' || !validatePackageName(source['packageName']).validForNewPackages || typeof source['version'] !== 'string' || valid(source['version']) !== source['version']) {
      throw new Error('An npm template source requires packageName and an exact semantic version, without tags or ranges.')
    }
    return { kind: 'npm', packageName: source['packageName'], version: source['version'], ...(source['registry'] !== undefined ? { registry: registryUrl(source['registry']) } : {}) }
  }
  if (source['kind'] === 'git') {
    if (Object.keys(source).some(key => !['kind', 'repository', 'ref'].includes(key)) || typeof source['repository'] !== 'string' || typeof source['ref'] !== 'string' || !gitRef(source['ref'])) {
      throw new Error('A Git template source requires a repository URL and an explicit ref or commit.')
    }
    let repository: URL
    try {
      repository = new URL(source['repository'])
    }
    catch {
      throw new Error('Use an https://, ssh:// or file:// Git repository URL without embedded credentials.')
    }
    if (!['https:', 'ssh:', 'file:'].includes(repository.protocol) || repository.password || (repository.username && !(repository.protocol === 'ssh:' && repository.username === 'git')) || repository.search || repository.hash) {
      throw new Error('Git URLs must use HTTPS, SSH or file transport and cannot contain credentials, queries or fragments; use the Git credential helper or SSH agent.')
    }
    return { kind: 'git', repository: repository.href, ref: source['ref'] }
  }
  throw new Error('Unsupported template remote source kind; use npm or git.')
}

export function normalizeTemplateSourceRequest(source: unknown, templatePath: string): TemplateSourceRequest {
  return { source: normalizeTemplateRemoteSource(source), templatePath: templateSourcePath(templatePath) }
}

export function sourceRequestKey(request: TemplateSourceRequest) {
  return createHash('sha256').update(JSON.stringify(request)).digest('hex')
}
