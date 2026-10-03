import type { ResolveTemplateCatalogOptions, TemplateCatalog, TemplateCatalogContext, TemplateCatalogDiagnostic } from './types'
import { resolveCatalogChoices } from './choices'
import { loadTemplateCatalogContext } from './config'
import { resolveCatalogEntries } from './entries'

export function createTemplateCatalog(context: TemplateCatalogContext): TemplateCatalog {
  const diagnostics: TemplateCatalogDiagnostic[] = []
  const entries = resolveCatalogEntries(context, diagnostics)
  const choices = resolveCatalogChoices(context, entries, diagnostics)
  return {
    workspaceDir: context.workspaceDir,
    configFile: context.configFile,
    templatesDir: context.templatesDir,
    entries: [...entries.values()],
    choices,
    diagnostics,
  }
}

/** Resolve declarations only; never generate files or execute template code. */
export async function resolveTemplateCatalog(options: ResolveTemplateCatalogOptions = {}): Promise<TemplateCatalog> {
  return createTemplateCatalog(await loadTemplateCatalogContext(options))
}

export type * from './types'
