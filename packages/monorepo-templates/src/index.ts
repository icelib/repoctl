import type { GetTemplateChoicesOptions, SuggestTemplateKeyOptions, TemplateCategory, TemplateChoice, TemplateDefinition } from './types'
import { assetTargets as rawAssetTargets, getAssetTargets as rawGetAssetTargets } from '../assets-data.mjs'
import { getWorkspacePackageManager } from './package-manager'
import { assetsDir, packageDir, skeletonDir, templatesDir } from './paths'
import { prepareAssets } from './prepare'
import { ensureTemplateAssetsPrepared } from './runtime-assets'
import { scaffoldTemplate, scaffoldWorkspace } from './scaffold'
import { getTemplateChoices } from './templates'
import { runCommand } from './utils/command'
import { isGitignoreFile, toPublishGitignorePath, toWorkspaceAssetPath, toWorkspaceGitignorePath } from './utils/gitignore'
import { createTemplateCopyFilter, shouldSkipTemplatePath } from './utils/template-filter'

export const templateChoices = getTemplateChoices()
export const assetTargets = rawAssetTargets as string[]
export const getAssetTargets = rawGetAssetTargets as (core?: boolean) => string[]

export { assetsDir, packageDir, skeletonDir, templatesDir }

export const templateSourceMap = Object.fromEntries(
  templateChoices.map(item => [item.key, item.source]),
) as Record<string, string>

export const templateTargetMap = Object.fromEntries(
  templateChoices.map(item => [item.key, item.target]),
) as Record<string, string>

export const templateMap = templateSourceMap

export { ensureTemplateAssetsPrepared, prepareAssets }
export { getWorkspacePackageManager }
export { scaffoldTemplate, scaffoldWorkspace }
export {
  getTemplateChoice,
  getTemplateChoices,
  getTemplateDefinition,
  getTemplateKeys,
  getTemplateSource,
  getTemplateTarget,
  isTemplateCategory,
  isTemplateKey,
  suggestTemplateKey,
  templateCategories,
} from './templates'
export {
  createTemplateCopyFilter,
  isGitignoreFile,
  runCommand,
  shouldSkipTemplatePath,
  toPublishGitignorePath,
  toWorkspaceAssetPath,
  toWorkspaceGitignorePath,
}
export type { GetTemplateChoicesOptions, SuggestTemplateKeyOptions, TemplateCategory, TemplateChoice, TemplateDefinition }
export { execaCommand } from './utils/command'
export { default as checkbox } from '@inquirer/checkbox'
export { default as input } from '@inquirer/input'
export { default as select } from '@inquirer/select'
export { Command, program } from 'commander'
