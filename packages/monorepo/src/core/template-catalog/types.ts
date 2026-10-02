import type { TemplateChoice, TemplateDefinition, TemplateRemoteSource } from '@icebreakers/monorepo-templates'
import type { CreateChoiceOption, CreateCommandConfig } from '../../types'
import type { OrganizationPresetLayer, OrganizationPresetReference } from '../../types/presets'
import type { ConfigDiagnostic } from '../config/validation'

export type CreateTemplateDefinition = TemplateDefinition & Partial<Pick<TemplateChoice, 'label' | 'category' | 'description'>>

export interface TemplateCatalogEntry extends TemplateChoice {
  sourceDir: string
  remote?: TemplateRemoteSource
  /** Present for a template declared by an installed organization preset. */
  preset?: OrganizationPresetReference
  origin: 'builtin' | 'custom'
  overridesBuiltin: boolean
  configFile: string | null
  configPath?: string
  short?: string
  disabled?: boolean | string
}

export interface TemplateCatalogDiagnostic {
  id: 'template-definition' | 'template-choice' | 'template-override' | 'templates-directory' | ConfigDiagnostic['id']
  status: 'warn' | 'fail'
  detail: string
  configFile: string | null
  configPath: string
  template?: string
  configDiagnostic?: ConfigDiagnostic
}

export interface TemplateCatalog {
  workspaceDir: string
  configFile: string | null
  templatesDir: string
  entries: TemplateCatalogEntry[]
  choices: CreateChoiceOption[]
  diagnostics: TemplateCatalogDiagnostic[]
}

export interface ResolveTemplateCatalogOptions {
  cwd?: string
  /** Override the template root for inspection; relative paths use the invocation directory. */
  templatesDir?: string
}

export interface TemplateCatalogContext {
  workspaceDir: string
  configFile: string | null
  templatesDir: string
  createConfig: CreateCommandConfig
  rawCreateConfigs?: CreateCommandConfig[]
  presetLayers?: OrganizationPresetLayer[]
  /** Failed configuration loading blocks every entry instead of restoring built-ins. */
  diagnostics?: TemplateCatalogDiagnostic[]
}
