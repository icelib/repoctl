import type {
  IcebreakerStylelintOptions,
  PresetToggles,
  StylelintConfig,
  StylelintPlugin,
} from './types'
import { createRequire } from 'node:module'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  noApplyRuleName,
  noArbitraryValueRuleName,
  noAtomicClassRuleName,
  noCssLayerRuleName,
  noInvalidApplyRuleName,
  noInvalidThemeFunctionRuleName,
  noScreenDirectiveRuleName,
  noThemeFunctionRuleName,
  base as tailwindcssBase,
  recommended as tailwindcssRecommended,
  strict as tailwindcssStrict,
  unocssNoApplyRuleName,
  unocssNoArbitraryValueRuleName,
  unocssNoAtomicClassRuleName,
  unocssNoInvalidApplyRuleName,
  unocssNoVariantGroupRuleName,
} from 'stylelint-plugin-tailwindcss'
import { PRESET_RECESS_ORDER, PRESET_VUE_SCSS } from './constants'
import { normalizeExtends, resolveIgnoreList, toArray, unique } from './utils'

const requireFromConfig = createRequire(import.meta.url)

const BEM_OOCSS_CLASS_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:__[a-z0-9]+(?:-[a-z0-9]+)*)*(?:--[a-z0-9]+(?:-[a-z0-9]+)*)*$/

function resolvePresetPath(specifier: string): string {
  const disableImportMetaResolve = process.env['ICEBREAKER_STYLELINT_DISABLE_IMPORT_META_RESOLVE'] === '1'

  if (!disableImportMetaResolve && typeof import.meta.resolve === 'function') {
    try {
      const resolved = import.meta.resolve(specifier)
      return fileURLToPath(resolved)
    }
    catch {
      // fall through to require.resolve
    }
  }

  try {
    return requireFromConfig.resolve(specifier)
  }
  catch {
    return specifier
  }
}

// Stylelint SCSS preset 的上游版本尚未声明 Stylelint 18 peer 范围。
// 在本包内保留同等规则层，并让它继承已支持 Stylelint 18 的 standard 配置。
const PRESET_PATH_STANDARD_SCSS = fileURLToPath(
  new URL('../presets/stylelint-config-standard-scss.mjs', import.meta.url),
)
const PRESET_PATH_VUE_SCSS = resolvePresetPath(PRESET_VUE_SCSS)
const PRESET_PATH_RECESS_ORDER = resolvePresetPath(PRESET_RECESS_ORDER)
const MINI_PROGRAM_IGNORE_FILES = [
  'dist/**',
  '.weapp-vite/**',
  'node_modules/**',
  'miniprogram_npm/**',
] as const

const SAFE_FORMATTING_RULES: NonNullable<StylelintConfig['rules']> = {
  'color-function-notation': 'modern',
  'declaration-block-no-redundant-longhand-properties': true,
  'function-url-quotes': 'always',
  'hue-degree-notation': 'number',
  'selector-attribute-quotes': 'always',
  'shorthand-property-no-redundant-values': true,
}

function resolvePresetExtends(presets: PresetToggles | undefined): string[] {
  const entries: string[] = []
  if (presets?.scss !== false) {
    entries.push(PRESET_PATH_STANDARD_SCSS)
  }
  if (presets?.vue !== false) {
    entries.push(PRESET_PATH_VUE_SCSS)
  }
  if (presets?.order !== false) {
    entries.push(PRESET_PATH_RECESS_ORDER)
  }
  return entries
}

function resolveExtends(options: IcebreakerStylelintOptions | undefined): StylelintConfig['extends'] {
  const presets = resolvePresetExtends(options?.presets)
  const extras = toArray(options?.extends)
  const values = unique([...presets, ...extras])
  return normalizeExtends(values)
}

function resolveOverrides(options: IcebreakerStylelintOptions | undefined): NonNullable<StylelintConfig['overrides']> {
  const overrides = options?.overrides
  if (!overrides || overrides.length === 0) {
    return []
  }

  return [...overrides]
}

function normalizePlugins(plugins: StylelintConfig['plugins'] | undefined): StylelintPlugin[] {
  return toArray<StylelintPlugin>(plugins)
}

function resolvePlugins(options: IcebreakerStylelintOptions | undefined): StylelintPlugin[] {
  return normalizePlugins(options?.plugins)
}

function resolveIgnoreFiles(options: IcebreakerStylelintOptions | undefined): StylelintConfig['ignoreFiles'] {
  const values = unique([
    ...(options?.miniProgram ? MINI_PROGRAM_IGNORE_FILES : []),
    ...toArray(options?.ignoreFiles),
  ])

  return normalizeExtends(values)
}

function resolveRules(options: IcebreakerStylelintOptions | undefined): NonNullable<StylelintConfig['rules']> {
  const ignoreUnits = resolveIgnoreList('units', options?.ignores)
  const ignoreTypes = resolveIgnoreList('types', options?.ignores)
  const ignoreAtRules = resolveIgnoreList('atRules', options?.ignores)
  const propertyNoVendorPrefixRule = options?.miniProgram
    ? null
    : [
        true,
        {
          severity: 'warning',
        },
      ]

  const rules: NonNullable<StylelintConfig['rules']> = {
    'function-name-case': null,
    'media-feature-range-notation': 'prefix',
    'property-no-vendor-prefix': propertyNoVendorPrefixRule,
    'selector-class-pattern': [
      new RegExp(BEM_OOCSS_CLASS_NAME_PATTERN),
      {
        message: 'Use BEM/OOCSS-friendly class names',
        resolveNestedSelectors: true,
      },
    ],
    'unit-no-unknown': [
      true,
      {
        ignoreUnits,
      },
    ],
    'selector-type-no-unknown': [
      true,
      {
        ignoreTypes,
      },
    ],
    'at-rule-no-deprecated': [
      true,
      {
        ignoreAtRules,
      },
    ],
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules,
      },
    ],
    'scss/selector-no-redundant-nesting-selector': true,
    'scss/at-rule-no-unknown': [
      true,
      {
        ignoreAtRules,
      },
    ],
  }

  if (options?.rules) {
    return {
      ...rules,
      ...options.rules,
    }
  }

  return rules
}

function resolveTailwindcssPreset(options: IcebreakerStylelintOptions | undefined) {
  switch (options?.tailwindcssPreset) {
    case 'recommended':
      return tailwindcssRecommended
    case 'strict':
      return tailwindcssStrict
    default:
      return tailwindcssBase
  }
}

function resolveFormattingPresetRules(
  options: IcebreakerStylelintOptions | undefined,
): NonNullable<StylelintConfig['rules']> {
  if (options?.formattingPreset === 'safe') {
    return SAFE_FORMATTING_RULES
  }

  return {}
}

export function createIcebreakerStylelintConfig(options: IcebreakerStylelintOptions = {}): StylelintConfig {
  const extendsConfig = resolveExtends(options)
  const overrides = resolveOverrides(options)
  const plugins = resolvePlugins(options)
  const ignoreFiles = resolveIgnoreFiles(options)
  const rules = resolveRules(options)
  const tailwindcssPreset = resolveTailwindcssPreset(options)
  const formattingPresetRules = resolveFormattingPresetRules(options)

  return {
    ...(extendsConfig !== undefined ? { extends: extendsConfig } : {}),
    ...(options.customSyntax !== undefined ? { customSyntax: options.customSyntax } : {}),
    ...(ignoreFiles !== undefined ? { ignoreFiles } : {}),
    plugins: [...normalizePlugins(tailwindcssPreset.plugins), ...plugins],
    overrides,
    rules: {
      ...(tailwindcssPreset.rules ?? {
        [noAtomicClassRuleName]: true,
        [noInvalidApplyRuleName]: true,
        [noApplyRuleName]: true,
        [noArbitraryValueRuleName]: true,
        [noThemeFunctionRuleName]: true,
        [noInvalidThemeFunctionRuleName]: true,
        [noScreenDirectiveRuleName]: true,
        [noCssLayerRuleName]: true,
        [unocssNoAtomicClassRuleName]: true,
        [unocssNoInvalidApplyRuleName]: true,
        [unocssNoApplyRuleName]: true,
        [unocssNoArbitraryValueRuleName]: true,
        [unocssNoVariantGroupRuleName]: true,
      }),
      ...formattingPresetRules,
      ...rules,
    },
  }
}
