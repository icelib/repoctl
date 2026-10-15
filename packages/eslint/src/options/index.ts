import type { Linter } from 'eslint'
import type { OptionsVue } from '../antfu'
import type { BetterTailwindcssOption, UserDefinedOptions } from '../types'
import { defu } from 'defu'
import { getDefaultTypescriptOptions, getDefaultVueOptions, isMiniProgramEnabled } from '../defaults'
import { isObject } from '../utils'
import { resolveFormattersOption } from './formatters'

const BASE_DEFAULTS: Pick<UserDefinedOptions, 'formatters' | 'javascript' | 'test' | 'pnpm'> = {
  formatters: true,
  pnpm: false,
  javascript: {
    overrides: {
      'curly': ['error', 'all'],
      'no-console': ['warn'],
    },
  },
  test: {
    overrides: {
      'test/prefer-lowercase-title': ['off'],
    },
  },
}

const BASE_RULES: Partial<Linter.RulesRecord> = {
  // `noPropertyAccessFromIndexSignature` requires bracket access (`obj['key']`)
  // for index-signature properties, which conflicts with ESLint core `dot-notation`.
  'dot-notation': 'off',
  // Keep dependency bans visible without blocking CI on upstream preset defaults.
  'e18e/ban-dependencies': ['warn', {
    allowed: [
      'axios',
      'lefthook',
    ],
  }],
  // Disable until upstream fixes false positives on non-array iterables (Set, Map).
  // See: [...new Set(arr)].sort() → new Set(arr).toSorted() is invalid.
  'e18e/prefer-array-to-sorted': 'off',
  // Disable all pnpm rules by default
  // @antfu/eslint-config auto-enables pnpm plugin when pnpm-workspace.yaml exists
  // but we want it opt-in instead of auto-enabled
  'pnpm/json-enforce-catalog': 'off',
  'pnpm/json-prefer-workspace-settings': 'off',
  'pnpm/json-valid-catalog': 'off',
  'pnpm/yaml-enforce-settings': 'off',
  'pnpm/yaml-no-duplicate-catalog-item': 'off',
  'pnpm/yaml-no-unused-catalog-item': 'off',
  'unused-imports/no-unused-vars': 'off',
  'unicorn/prefer-number-properties': 'warn',
}

export type ResolvedUserOptions = UserDefinedOptions & {
  tailwindcss?: boolean
  betterTailwindcss?: BetterTailwindcssOption | boolean
}

function mergeOptionWithDefaults<T extends object>(
  input: T | boolean | undefined,
  defaults: T,
  options: {
    postProcess?: (merged: T) => void
    useDefaultWhenUndefined?: boolean
  } = {},
): T | boolean | undefined {
  const { postProcess, useDefaultWhenUndefined = false } = options
  const shouldUseDefaults = input === true || (useDefaultWhenUndefined && input === undefined)

  if (shouldUseDefaults) {
    postProcess?.(defaults)
    return defaults
  }

  if (isObject(input)) {
    const merged = defu(input, defaults)
    postProcess?.(merged)
    return merged
  }

  return input
}

function applyVueVersionSpecificRules(option: OptionsVue | boolean | undefined): void {
  if (!option || typeof option !== 'object') {
    return
  }

  const overrides = option.overrides
  if (!overrides) {
    return
  }

  if (option.vueVersion === 2) {
    Object.assign(overrides, {
      'vue/no-v-for-template-key-on-child': 'off',
      'vue/no-v-for-template-key': 'error',
      'vue/no-deprecated-v-bind-sync': 'off',
    })
    return
  }

  Object.assign(overrides, {
    'vue/no-v-for-template-key-on-child': 'error',
    'vue/no-v-for-template-key': 'off',
  })
}

export function resolveUserOptions(options?: UserDefinedOptions): ResolvedUserOptions {
  const resolved = defu<UserDefinedOptions, [UserDefinedOptions, typeof BASE_DEFAULTS]>(
    {},
    options ?? {},
    BASE_DEFAULTS,
  ) as ResolvedUserOptions

  if (isMiniProgramEnabled(options)) {
    resolved.miniProgram = true
    delete resolved.weapp
  }

  const legacyTailwindcssOption = resolved.tailwindcss as unknown
  if (isObject(legacyTailwindcssOption)) {
    resolved.betterTailwindcss ??= legacyTailwindcssOption as BetterTailwindcssOption
    delete resolved.tailwindcss
  }

  const resolvedVue = mergeOptionWithDefaults(
    resolved.vue,
    getDefaultVueOptions(options),
    {
      postProcess: applyVueVersionSpecificRules,
    },
  )
  if (resolvedVue === undefined) {
    delete resolved.vue
  }
  else {
    resolved.vue = resolvedVue
  }

  const resolvedTypescript = mergeOptionWithDefaults(
    resolved.typescript,
    getDefaultTypescriptOptions(options),
    {
      useDefaultWhenUndefined: true,
    },
  )
  if (resolvedTypescript === undefined) {
    delete resolved.typescript
  }
  else {
    resolved.typescript = resolvedTypescript
  }

  resolved.formatters = resolveFormattersOption(options?.formatters)

  return resolved
}

export function createBaseRuleSet(isLegacy: boolean): Partial<Linter.RulesRecord> {
  if (!isLegacy) {
    return BASE_RULES
  }

  return {
    ...BASE_RULES,
    'perfectionist/sort-imports': 'off',
  }
}

export { applyVueVersionSpecificRules as __applyVueVersionSpecificRules }
export { isPackageAvailable as __isPackageAvailable } from '../utils'
export { __inferPrettierEndOfLineFromEditorConfig, __parseEditorConfig, resolveFormattersOption as __resolveFormattersOption } from './formatters'
