export type TemplateParameterValue = string | boolean

interface ParameterDetails {
  description?: string
  required?: boolean
}

export type TemplateParameterDefinition = ParameterDetails & (
  | { type: 'string', default?: string, sensitive?: boolean }
  | { type: 'boolean', default?: boolean, sensitive?: false }
  | { type: 'enum', options: string[], default?: string, sensitive?: false }
)
export type TemplateParameterSchema = Record<string, TemplateParameterDefinition>
export type TemplateParameterValues = Record<string, TemplateParameterValue>

export interface ResolvedTemplateParameters {
  /** For rendering only. Never put this object in a log or persisted report. */
  values: TemplateParameterValues
  report: TemplateParameterValues
  retained: TemplateParameterValues
  sensitive: string[]
}

export interface TemplateParameterCondition {
  parameter: string
  equals: TemplateParameterValue
}

export interface TemplateConditionalFiles {
  when: TemplateParameterCondition
  /** Exact source-relative file or directory paths, without expressions or globs. */
  files?: string[]
  package?: Partial<Record<'scripts' | 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies', Record<string, string>>>
}

/** Optional repoctl.template.json inside a template source directory. */
export interface TemplateParameterManifest {
  schemaVersion: 1
  parameters: TemplateParameterSchema
  /** Only these UTF-8 text files expand {{repoctl:name}} or {{repoctl-json:name}}. */
  interpolate?: string[]
  conditions?: TemplateConditionalFiles[]
}
