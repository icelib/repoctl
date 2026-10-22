export type DocsChannel = 'preview' | 'stable'

export interface DocsDeploymentTarget {
  /** Root package.json script; the provider writes { versionId, url? } to REPO_DOCS_RESULT_FILE. */
  deployScript: string
  url?: string
}

export interface DocsSiteConfig {
  /** Product packages documented by this site; workspace runtime dependencies are included. */
  packages: string[]
  /** Repository-relative input globs per package. Prefix exclusions with !. */
  releaseInputs?: Record<string, string[]>
  /** Root package.json script, run in the complete frozen source checkout. */
  buildScript: string
  preview: DocsDeploymentTarget
  stable: DocsDeploymentTarget
  /** Repository-relative globs for individually selected documentation corrections. */
  patchPaths: string[]
}

export interface DocsCommandConfig {
  /** Sites are explicitly enabled; an empty map does not deploy anything. */
  sites?: Record<string, DocsSiteConfig>
}
