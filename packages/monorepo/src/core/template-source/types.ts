import type { ResolvedTemplateRemoteSource, TemplateRemoteSource } from '@icebreakers/monorepo-templates'

export interface TemplateSourceOptions {
  cwd?: string
  cacheDir?: string
  offline?: boolean
  timeoutMs?: number
}

export interface TemplateSourceRequest {
  source: TemplateRemoteSource
  templatePath: string
}

export interface TemplateSourceManifest {
  schemaVersion: 1
  request: TemplateSourceRequest
  resolved: ResolvedTemplateRemoteSource
  digest: string
  archiveDigest: string
}

export interface ResolvedTemplateSource {
  sourceDir: string
  request: TemplateSourceRequest
  resolved: ResolvedTemplateRemoteSource
  digest: string
  cache: 'hit' | 'downloaded'
}
