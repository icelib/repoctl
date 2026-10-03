import type { CreateTemplateDefinition, TemplateCatalog, TemplateCatalogEntry, TemplateHealthReport } from '..'
import { expectAssignable, expectType } from 'tsd'
import { checkTemplates, defineMonorepoConfig, resolveTemplateCatalog } from '..'

expectType<Promise<TemplateCatalog>>(resolveTemplateCatalog({ cwd: '.', templatesDir: './templates' }))
expectType<Promise<TemplateHealthReport>>(checkTemplates({ cwd: '.' }))
expectAssignable<CreateTemplateDefinition>({ source: 'team', target: 'apps/team', label: 'Team', description: 'Internal app', category: 'app' })
expectType<'builtin' | 'custom'>((null as unknown as TemplateCatalogEntry).origin)
defineMonorepoConfig({ commands: { create: { templateMap: { legacy: 'legacy', custom: { source: 'custom', target: 'apps/custom', category: 'app', description: 'Custom' } } } } })
