import type { TemplateCategory } from '@icebreakers/monorepo-templates'
import type { PackageCheckCommand, PackageCheckReport } from '../package-check'

export type TemplateValidationStage = 'inspect' | 'generate' | 'install' | 'build' | 'lint' | 'lint:styles' | 'typecheck' | 'tsd' | 'test' | 'test:e2e' | 'artifact'

export interface TemplateValidationOptions {
  template: string
  cwd?: string
  /** Each name is generated and validated in its own isolated workspace. */
  names?: string[]
  /** Optional author-owned workspace fixture; copied, never modified in place. */
  fixtureDir?: string
  keep?: 'never' | 'failure' | 'always'
  timeoutMs?: number
  signal?: AbortSignal
}

export interface TemplateValidationDiagnostic {
  code: string
  message: string
  file?: string
}

export interface TemplateValidationPlan {
  schemaVersion: 1
  template: string
  sourceDir: string
  category: TemplateCategory | null
  fixtureDir: string
  packageManager: string
  names: string[]
  scripts: string[]
  diagnostics: TemplateValidationDiagnostic[]
}

export interface TemplateValidationStep {
  stage: TemplateValidationStage
  status: 'passed' | 'failed' | 'interrupted'
  command?: PackageCheckCommand
  diagnostics: TemplateValidationDiagnostic[]
}

export interface TemplateValidationSample {
  name: string
  directory: string
  status: 'passed' | 'failed' | 'interrupted'
  failedStage?: TemplateValidationStage
  steps: TemplateValidationStep[]
  artifact?: PackageCheckReport
}

export interface TemplateValidationReport {
  schemaVersion: 1
  status: 'passed' | 'failed' | 'interrupted'
  plan: TemplateValidationPlan
  samples: TemplateValidationSample[]
  temporaryDirectory?: string
  retained: boolean
}
