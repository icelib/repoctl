export type GeneratorName = 'vue-component' | 'react-component' | 'hono-route'

export interface GenerateOptions {
  cwd: string
  package: string
  generator: GeneratorName
  parameters: Record<string, unknown>
  /** Package-relative source directory. */
  directory?: string
  /** Package-relative barrel, used only when the export parameter is true. */
  barrel?: string
}

export interface GenerateFile {
  path: string
  before: string | null
  after: string
  action: 'create' | 'update' | 'unchanged'
}

export interface GeneratePlan {
  schemaVersion: 1
  workspaceDir: string
  packageDir: string
  packageName: string
  options: GenerateOptions
  inputs: Record<string, string>
  files: GenerateFile[]
  nextSteps: string[]
}

export interface GenerateResult {
  schemaVersion: 1
  changed: string[]
  recoveryFiles: string[]
  nextSteps: string[]
}
