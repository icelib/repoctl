import type { TemplateFileDifference, TemplateGenerationParameters, TemplateGenerationProfile, TemplateInstanceSource } from '@icebreakers/monorepo-templates'

export interface TemplateLinkOptions {
  cwd: string
  target: string
  template: string
  version: string
  sourceDir?: string
  profile?: TemplateGenerationProfile
  parameters?: TemplateGenerationParameters
  allowUnverified?: boolean
}

export interface TemplateLinkPlan {
  schemaVersion: 1
  options: TemplateLinkOptions
  target: string
  source: TemplateInstanceSource
  baselineStatus: 'available' | 'unverified'
  action: 'register' | 'verify' | 'unchanged' | 'conflict'
  limitations: string[]
  differences: TemplateFileDifference[]
  registryDigest: string
  targetDigest: string
  fingerprint: string
}
