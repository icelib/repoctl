import type { PackageJson } from '@/types'

export const initToolingTargets = [
  'commitlint',
  'eslint',
  'stylelint',
  'lefthook',
  'tsconfig',
  'vitest',
] as const

export type InitToolingTarget = (typeof initToolingTargets)[number]

export interface InitToolingExecutionOptions {
  targets?: InitToolingTarget[]
  all?: boolean
  force?: boolean
}

export interface InitToolingContext {
  cwd: string
  packageJson: PackageJson
  toolingPackageName: 'repoctl'
  toolingImportSource: 'repoctl/tooling'
}

export interface InitToolingPreset {
  target: InitToolingTarget
  filepath: string
  getContent: (context: InitToolingContext) => Promise<string> | string
  getDependencies: (context: InitToolingContext) => Record<string, string>
}

export interface InitToolingResult {
  selectedTargets: InitToolingTarget[]
  writtenFiles: string[]
  skippedFiles: string[]
  updatedPackageJson: boolean
}
