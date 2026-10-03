import type { TemplateCategory, TemplateDefinition } from '@icebreakers/monorepo-templates'
import type { MonorepoConfig } from './config'

/** Explicit identity of an already installed npm package; ranges and tags are not accepted. */
export interface OrganizationPresetReference {
  packageName: string
  version: string
}

export interface OrganizationPresetTemplate extends Omit<TemplateDefinition, 'remote'> {
  label?: string
  description?: string
  category?: TemplateCategory
}

export interface OrganizationPresetAsset {
  /** File inside the preset package. */
  source: string
  /** Explicit engineering asset path inside the consuming workspace. */
  target: string
}

/** Pure JSON, stored as repoctl.preset.json in the published package root. */
export interface OrganizationPresetManifest {
  schemaVersion: 1
  requires: { repoctl: string }
  extends?: OrganizationPresetReference[]
  config?: Omit<MonorepoConfig, 'presets'>
  templates?: Record<string, OrganizationPresetTemplate>
  /** Recommendations only; applying a preset never installs these capabilities. */
  capabilities?: Array<{ id: string, reason?: string }>
  assets?: OrganizationPresetAsset[]
}

export interface OrganizationPresetSource extends OrganizationPresetReference {
  id: string
  directory: string
  manifestFile: string
  manifestHash: string
  packageJsonHash: string
}

export interface OrganizationPresetLayer {
  source: OrganizationPresetSource
  manifest: OrganizationPresetManifest
}

export interface OrganizationPresetDiagnostic {
  id: 'preset.invalid-reference' | 'preset.missing-package' | 'preset.version-mismatch' | 'preset.invalid-manifest' | 'preset.incompatible' | 'preset.cycle' | 'preset.duplicate' | 'preset.conflicting-version' | 'preset.limit'
  status: 'warn' | 'fail'
  path: string
  source: string | null
  detail: string
}

export interface OrganizationPresetResolution {
  /** Canonical workspace root for valid nonempty references; otherwise normalized absolute cwd without filesystem reads. */
  workspaceDir: string
  /** Lowest to highest precedence; dependencies precede the presets that extend them. */
  layers: OrganizationPresetLayer[]
  diagnostics: OrganizationPresetDiagnostic[]
  /** Every read package/manifest is part of any later write plan's preconditions. */
  inputs: Array<{ path: string, hash: string }>
  locations: Array<{ packageName: string, fromDirectory: string, directory: string }>
}

export interface ConfigValueSource {
  kind: 'default' | 'preset' | 'project' | 'cli'
  file?: string | null
  packageName?: string
  version?: string
}

export interface ConfigSourceLayer {
  source: ConfigValueSource
  config: MonorepoConfig
}
