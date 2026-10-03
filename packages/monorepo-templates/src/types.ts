export type TemplateCategory = 'app' | 'docs' | 'library' | 'service' | 'tool'

export type TemplateRemoteSource
  = { kind: 'npm', packageName: string, version: string, registry?: string }
    | { kind: 'git', repository: string, ref: string }

export type ResolvedTemplateRemoteSource
  = { kind: 'npm', packageName: string, requestedVersion: string, version: string, registry: string, integrity: string }
    | { kind: 'git', repository: string, requestedRef: string, commit: string, integrity: string }

export interface TemplateChoice {
  key: string
  label: string
  source: string
  target: string
  description?: string
  category?: TemplateCategory
}

export interface TemplateDefinition {
  source: string
  target: string
  /** Resolve source relative to this immutable remote asset instead of templatesDir. */
  remote?: TemplateRemoteSource
}

export interface GetTemplateChoicesOptions {
  category?: TemplateCategory
}

export interface SuggestTemplateKeyOptions extends GetTemplateChoicesOptions {
  keys?: readonly string[]
}
