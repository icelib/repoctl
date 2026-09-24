import type { TemplateChoice } from '..'
import { expectAssignable, expectType } from 'tsd'
import {
  assetTargets,
  getAssetTargets,
  getTemplateChoice,
  getTemplateChoices,
  getTemplateDefinition,
  getTemplateKeys,
  getTemplateSource,
  getTemplateTarget,
  getWorkspacePackageManager,
  isTemplateCategory,
  isTemplateKey,
  suggestTemplateKey,
  templateCategories,
  templateChoices,
  templateSourceMap,
  templateTargetMap,
  toWorkspaceAssetPath,
  toWorkspaceGitignorePath,
} from '..'

expectType<string[]>(assetTargets)
expectType<string[]>(getAssetTargets())
expectType<Promise<string>>(getWorkspacePackageManager())
expectType<string | undefined>(templateSourceMap['cli'])
expectType<string | undefined>(templateTargetMap['cli'])
expectType<string>(toWorkspaceGitignorePath('gitignore'))
expectType<string>(toWorkspaceAssetPath('npmrc'))
expectAssignable<TemplateChoice[]>(templateChoices)
expectAssignable<readonly string[]>(templateCategories)
expectAssignable<TemplateChoice[]>(getTemplateChoices())
expectAssignable<TemplateChoice[]>(getTemplateChoices({ category: 'library' }))
expectType<string[]>(getTemplateKeys())
expectType<TemplateChoice | undefined>(getTemplateChoice('cli'))
expectType<boolean>(isTemplateCategory('library'))
expectType<boolean>(isTemplateKey('cli'))
expectType<string | undefined>(getTemplateSource('cli'))
expectType<string | undefined>(getTemplateTarget('cli'))
expectType<{ source: string, target: string } | undefined>(getTemplateDefinition('cli'))
expectType<string | undefined>(suggestTemplateKey('tsdwon'))
expectType<string | undefined>(suggestTemplateKey('custom', { keys: ['custom-template'] }))
