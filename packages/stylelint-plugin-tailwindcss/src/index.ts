import type { Config, Plugin, Rule, Warning } from 'stylelint'
import stylelint from 'stylelint'
import {
  createNoInvalidApplyRuleFunction,
  noInvalidApplyRuleFunction,
} from './apply-rule'
import {
  NO_APPLY_RULE_NAME,
  NO_ARBITRARY_VALUE_RULE_NAME,
  NO_ATOMIC_CLASS_RULE_NAME,
  NO_INVALID_APPLY_RULE_NAME,
  TAILWINDCSS_NO_APPLY_RULE_NAME,
  TAILWINDCSS_NO_ARBITRARY_VALUE_RULE_NAME,
  TAILWINDCSS_NO_ATOMIC_CLASS_RULE_NAME,
  TAILWINDCSS_NO_CSS_LAYER_RULE_NAME,
  TAILWINDCSS_NO_IMPORT_DIRECTIVE_RULE_NAME,
  TAILWINDCSS_NO_INVALID_APPLY_RULE_NAME,
  TAILWINDCSS_NO_INVALID_THEME_FUNCTION_RULE_NAME,
  TAILWINDCSS_NO_SCREEN_DIRECTIVE_RULE_NAME,
  TAILWINDCSS_NO_TAILWIND_DIRECTIVE_RULE_NAME,
  TAILWINDCSS_NO_THEME_FUNCTION_RULE_NAME,
  UNOCSS_NO_APPLY_RULE_NAME,
  UNOCSS_NO_ARBITRARY_VALUE_RULE_NAME,
  UNOCSS_NO_ATOMIC_CLASS_RULE_NAME,
  UNOCSS_NO_INVALID_APPLY_RULE_NAME,
  UNOCSS_NO_VARIANT_GROUP_RULE_NAME,
} from './constants'
import {
  createMessages,
  createNoApplyMessages,
  createNoArbitraryValueMessages,
  createNoCssLayerMessages,
  createNoImportDirectiveMessages,
  createNoInvalidApplyMessages,
  createNoInvalidThemeFunctionMessages,
  createNoScreenDirectiveMessages,
  createNoTailwindDirectiveMessages,
  createNoThemeFunctionMessages,
  createNoVariantGroupMessages,
  messages,
  noApplyMessages,
  noArbitraryValueMessages,
  noInvalidApplyMessages,
} from './messages'
import { createNoApplyRuleFunction, noApplyRuleFunction } from './no-apply-rule'
import {
  createNoArbitraryValueRuleFunction,
  noArbitraryValueRuleFunction,
} from './no-arbitrary-value-rule'
import {
  noCssLayerRuleFunction,
} from './no-css-layer-rule'
import {
  noImportDirectiveRuleFunction,
} from './no-import-directive-rule'
import {
  noInvalidThemeFunctionRuleFunction,
} from './no-invalid-theme-function-rule'
import {
  noScreenDirectiveRuleFunction,
} from './no-screen-directive-rule'
import {
  noTailwindDirectiveRuleFunction,
} from './no-tailwind-directive-rule'
import {
  noThemeFunctionRuleFunction,
} from './no-theme-function-rule'
import {
  createNoVariantGroupRuleFunction,
} from './no-variant-group-rule'
import { createRuleFunction, ruleFunction } from './rule'
import { hasUnoCssRuntime, isUnoCssUtilityClass } from './unocss-runtime'

interface StylelintPluginConfig {
  plugins: Plugin[]
  rules: NonNullable<Config['rules']>
}

const RULE_DOCS_BASE_URL = 'https://github.com/icelib/repoctl/blob/main/packages/stylelint-plugin-tailwindcss/docs/rules'

function getRuleDocUrl(ruleName: string) {
  const [namespace, name] = ruleName.split('/')
  if (!namespace || !name) {
    return RULE_DOCS_BASE_URL
  }

  return `${RULE_DOCS_BASE_URL}/${namespace}/${name}.md`
}

function createPluginBundle(names: {
  noApply: string
  noArbitraryValue: string
  noAtomicClass: string
  noInvalidApply: string
  noVariantGroup?: string
}, detection: {
  hasRuntime: (fromFile?: string) => Promise<boolean>
  isUtilityClass: (className: string, fromFile?: string) => Promise<boolean>
}) {
  const noAtomicClassRuleFunction = createRuleFunction(
    names.noAtomicClass,
    detection.isUtilityClass,
  )
  noAtomicClassRuleFunction.ruleName = names.noAtomicClass
  noAtomicClassRuleFunction.messages = createMessages(names.noAtomicClass) as Rule['messages']
  noAtomicClassRuleFunction.meta = {
    url: getRuleDocUrl(names.noAtomicClass),
  }

  const noInvalidApplyRule = createNoInvalidApplyRuleFunction(
    names.noInvalidApply,
    detection.isUtilityClass,
    detection.hasRuntime,
  )
  noInvalidApplyRule.ruleName = names.noInvalidApply
  noInvalidApplyRule.messages = createNoInvalidApplyMessages(names.noInvalidApply) as Rule['messages']
  noInvalidApplyRule.meta = {
    url: getRuleDocUrl(names.noInvalidApply),
  }

  const noApplyRule = createNoApplyRuleFunction(names.noApply)
  noApplyRule.ruleName = names.noApply
  noApplyRule.messages = createNoApplyMessages(names.noApply) as Rule['messages']
  noApplyRule.meta = {
    url: getRuleDocUrl(names.noApply),
  }

  const noArbitraryValueRule = createNoArbitraryValueRuleFunction(names.noArbitraryValue)
  noArbitraryValueRule.ruleName = names.noArbitraryValue
  noArbitraryValueRule.messages = createNoArbitraryValueMessages(
    names.noArbitraryValue,
  ) as Rule['messages']
  noArbitraryValueRule.meta = {
    url: getRuleDocUrl(names.noArbitraryValue),
  }

  const noVariantGroupRule = names.noVariantGroup
    ? createNoVariantGroupRuleFunction(names.noVariantGroup)
    : undefined

  if (noVariantGroupRule && names.noVariantGroup) {
    noVariantGroupRule.ruleName = names.noVariantGroup
    noVariantGroupRule.messages = createNoVariantGroupMessages(
      names.noVariantGroup,
    ) as Rule['messages']
    noVariantGroupRule.meta = {
      url: getRuleDocUrl(names.noVariantGroup),
    }
  }

  return {
    noApplyPlugin: stylelint.createPlugin(names.noApply, noApplyRule),
    noApplyRule,
    noArbitraryValuePlugin: stylelint.createPlugin(
      names.noArbitraryValue,
      noArbitraryValueRule,
    ),
    noArbitraryValueRule,
    noAtomicClassPlugin: stylelint.createPlugin(names.noAtomicClass, noAtomicClassRuleFunction),
    noAtomicClassRule: noAtomicClassRuleFunction,
    noInvalidApplyPlugin: stylelint.createPlugin(
      names.noInvalidApply,
      noInvalidApplyRule,
    ),
    noInvalidApplyRule,
    ...(noVariantGroupRule && names.noVariantGroup
      ? {
          noVariantGroupPlugin: stylelint.createPlugin(
            names.noVariantGroup,
            noVariantGroupRule,
          ),
          noVariantGroupRule,
        }
      : {}),
  }
}

function createBaseConfig(plugins: {
  noAtomicClassPlugin: Plugin
  noInvalidApplyPlugin: Plugin
}, names: {
  noAtomicClass: string
  noInvalidApply: string
}): StylelintPluginConfig {
  return {
    plugins: [
      plugins.noAtomicClassPlugin,
      plugins.noInvalidApplyPlugin,
    ],
    rules: {
      [names.noAtomicClass]: true,
      [names.noInvalidApply]: true,
    },
  }
}

function createRecommendedConfig(plugins: {
  noApplyPlugin: Plugin
  noArbitraryValuePlugin: Plugin
  noAtomicClassPlugin: Plugin
  noInvalidApplyPlugin: Plugin
  extraPlugins?: Plugin[]
}, names: {
  noApply: string
  noArbitraryValue: string
  noAtomicClass: string
  noInvalidApply: string
  extraRules?: string[]
}): StylelintPluginConfig {
  return {
    plugins: [
      plugins.noAtomicClassPlugin,
      plugins.noInvalidApplyPlugin,
      plugins.noApplyPlugin,
      plugins.noArbitraryValuePlugin,
      ...(plugins.extraPlugins ?? []),
    ],
    rules: {
      [names.noAtomicClass]: true,
      [names.noInvalidApply]: true,
      [names.noApply]: true,
      [names.noArbitraryValue]: true,
      ...Object.fromEntries((names.extraRules ?? []).map(ruleName => [ruleName, true])),
    },
  }
}

export { noInvalidApplyRuleFunction } from './apply-rule'
export { messages } from './messages'
export { noApplyMessages } from './messages'
export { noArbitraryValueMessages } from './messages'
export { noInvalidApplyMessages } from './messages'
export { noApplyRuleFunction } from './no-apply-rule'
export { noArbitraryValueRuleFunction } from './no-arbitrary-value-rule'
export { noCssLayerRuleFunction } from './no-css-layer-rule'
export { noImportDirectiveRuleFunction } from './no-import-directive-rule'
export { noInvalidThemeFunctionRuleFunction } from './no-invalid-theme-function-rule'
export { noScreenDirectiveRuleFunction } from './no-screen-directive-rule'
export { noTailwindDirectiveRuleFunction } from './no-tailwind-directive-rule'
export { noThemeFunctionRuleFunction } from './no-theme-function-rule'
export { noVariantGroupRuleFunction } from './no-variant-group-rule'
export { ruleFunction } from './rule'
export { isTailwindUtilityClass } from './runtime'
export { isUnoCssUtilityClass } from './unocss-runtime'

ruleFunction.ruleName = NO_ATOMIC_CLASS_RULE_NAME
ruleFunction.messages = messages as Rule['messages']
ruleFunction.meta = {
  url: getRuleDocUrl(NO_ATOMIC_CLASS_RULE_NAME),
}

const noAtomicClassPlugin = stylelint.createPlugin(NO_ATOMIC_CLASS_RULE_NAME, ruleFunction)
const noInvalidApplyPlugin = stylelint.createPlugin(
  NO_INVALID_APPLY_RULE_NAME,
  noInvalidApplyRuleFunction,
)
const noApplyPlugin = stylelint.createPlugin(
  NO_APPLY_RULE_NAME,
  noApplyRuleFunction,
)
const noArbitraryValuePlugin = stylelint.createPlugin(
  NO_ARBITRARY_VALUE_RULE_NAME,
  noArbitraryValueRuleFunction,
)
const noThemeFunctionPlugin = stylelint.createPlugin(
  TAILWINDCSS_NO_THEME_FUNCTION_RULE_NAME,
  noThemeFunctionRuleFunction,
)
const noScreenDirectivePlugin = stylelint.createPlugin(
  TAILWINDCSS_NO_SCREEN_DIRECTIVE_RULE_NAME,
  noScreenDirectiveRuleFunction,
)
const noTailwindDirectivePlugin = stylelint.createPlugin(
  TAILWINDCSS_NO_TAILWIND_DIRECTIVE_RULE_NAME,
  noTailwindDirectiveRuleFunction,
)
const noImportDirectivePlugin = stylelint.createPlugin(
  TAILWINDCSS_NO_IMPORT_DIRECTIVE_RULE_NAME,
  noImportDirectiveRuleFunction,
)
const noInvalidThemeFunctionPlugin = stylelint.createPlugin(
  TAILWINDCSS_NO_INVALID_THEME_FUNCTION_RULE_NAME,
  noInvalidThemeFunctionRuleFunction,
)
const noCssLayerPlugin = stylelint.createPlugin(
  TAILWINDCSS_NO_CSS_LAYER_RULE_NAME,
  noCssLayerRuleFunction,
)

noInvalidApplyRuleFunction.ruleName = NO_INVALID_APPLY_RULE_NAME
noInvalidApplyRuleFunction.messages = noInvalidApplyMessages as Rule['messages']
noInvalidApplyRuleFunction.meta = {
  url: getRuleDocUrl(NO_INVALID_APPLY_RULE_NAME),
}

noApplyRuleFunction.ruleName = NO_APPLY_RULE_NAME
noApplyRuleFunction.messages = noApplyMessages as Rule['messages']
noApplyRuleFunction.meta = {
  url: getRuleDocUrl(NO_APPLY_RULE_NAME),
}

noArbitraryValueRuleFunction.ruleName = NO_ARBITRARY_VALUE_RULE_NAME
noArbitraryValueRuleFunction.messages = noArbitraryValueMessages as Rule['messages']
noArbitraryValueRuleFunction.meta = {
  url: getRuleDocUrl(NO_ARBITRARY_VALUE_RULE_NAME),
}

noThemeFunctionRuleFunction.ruleName = TAILWINDCSS_NO_THEME_FUNCTION_RULE_NAME
noThemeFunctionRuleFunction.messages = createNoThemeFunctionMessages(
  TAILWINDCSS_NO_THEME_FUNCTION_RULE_NAME,
) as Rule['messages']
noThemeFunctionRuleFunction.meta = {
  url: getRuleDocUrl(TAILWINDCSS_NO_THEME_FUNCTION_RULE_NAME),
}

noScreenDirectiveRuleFunction.ruleName = TAILWINDCSS_NO_SCREEN_DIRECTIVE_RULE_NAME
noScreenDirectiveRuleFunction.messages = createNoScreenDirectiveMessages(
  TAILWINDCSS_NO_SCREEN_DIRECTIVE_RULE_NAME,
) as Rule['messages']
noScreenDirectiveRuleFunction.meta = {
  url: getRuleDocUrl(TAILWINDCSS_NO_SCREEN_DIRECTIVE_RULE_NAME),
}

noTailwindDirectiveRuleFunction.ruleName = TAILWINDCSS_NO_TAILWIND_DIRECTIVE_RULE_NAME
noTailwindDirectiveRuleFunction.messages = createNoTailwindDirectiveMessages(
  TAILWINDCSS_NO_TAILWIND_DIRECTIVE_RULE_NAME,
) as Rule['messages']
noTailwindDirectiveRuleFunction.meta = {
  url: getRuleDocUrl(TAILWINDCSS_NO_TAILWIND_DIRECTIVE_RULE_NAME),
}

noImportDirectiveRuleFunction.ruleName = TAILWINDCSS_NO_IMPORT_DIRECTIVE_RULE_NAME
noImportDirectiveRuleFunction.messages = createNoImportDirectiveMessages(
  TAILWINDCSS_NO_IMPORT_DIRECTIVE_RULE_NAME,
) as Rule['messages']
noImportDirectiveRuleFunction.meta = {
  url: getRuleDocUrl(TAILWINDCSS_NO_IMPORT_DIRECTIVE_RULE_NAME),
}

noInvalidThemeFunctionRuleFunction.ruleName = TAILWINDCSS_NO_INVALID_THEME_FUNCTION_RULE_NAME
noInvalidThemeFunctionRuleFunction.messages = createNoInvalidThemeFunctionMessages(
  TAILWINDCSS_NO_INVALID_THEME_FUNCTION_RULE_NAME,
) as Rule['messages']
noInvalidThemeFunctionRuleFunction.meta = {
  url: getRuleDocUrl(TAILWINDCSS_NO_INVALID_THEME_FUNCTION_RULE_NAME),
}

noCssLayerRuleFunction.ruleName = TAILWINDCSS_NO_CSS_LAYER_RULE_NAME
noCssLayerRuleFunction.messages = createNoCssLayerMessages(
  TAILWINDCSS_NO_CSS_LAYER_RULE_NAME,
) as Rule['messages']
noCssLayerRuleFunction.meta = {
  url: getRuleDocUrl(TAILWINDCSS_NO_CSS_LAYER_RULE_NAME),
}

const unocssBundle = createPluginBundle({
  noApply: UNOCSS_NO_APPLY_RULE_NAME,
  noArbitraryValue: UNOCSS_NO_ARBITRARY_VALUE_RULE_NAME,
  noAtomicClass: UNOCSS_NO_ATOMIC_CLASS_RULE_NAME,
  noInvalidApply: UNOCSS_NO_INVALID_APPLY_RULE_NAME,
  noVariantGroup: UNOCSS_NO_VARIANT_GROUP_RULE_NAME,
}, {
  hasRuntime: hasUnoCssRuntime,
  isUtilityClass: isUnoCssUtilityClass,
})

const base: StylelintPluginConfig = {
  plugins: [
    noAtomicClassPlugin,
    noInvalidApplyPlugin,
    unocssBundle.noAtomicClassPlugin,
    unocssBundle.noInvalidApplyPlugin,
  ],
  rules: {
    [TAILWINDCSS_NO_ATOMIC_CLASS_RULE_NAME]: true,
    [TAILWINDCSS_NO_INVALID_APPLY_RULE_NAME]: true,
    [UNOCSS_NO_ATOMIC_CLASS_RULE_NAME]: true,
    [UNOCSS_NO_INVALID_APPLY_RULE_NAME]: true,
  },
}

const recommended: StylelintPluginConfig = {
  plugins: [
    noAtomicClassPlugin,
    noInvalidApplyPlugin,
    noApplyPlugin,
    noArbitraryValuePlugin,
    noInvalidThemeFunctionPlugin,
    unocssBundle.noAtomicClassPlugin,
    unocssBundle.noInvalidApplyPlugin,
    unocssBundle.noApplyPlugin,
    unocssBundle.noArbitraryValuePlugin,
    ...(unocssBundle.noVariantGroupPlugin ? [unocssBundle.noVariantGroupPlugin] : []),
  ],
  rules: {
    [TAILWINDCSS_NO_ATOMIC_CLASS_RULE_NAME]: true,
    [TAILWINDCSS_NO_INVALID_APPLY_RULE_NAME]: true,
    [TAILWINDCSS_NO_APPLY_RULE_NAME]: true,
    [TAILWINDCSS_NO_ARBITRARY_VALUE_RULE_NAME]: true,
    [TAILWINDCSS_NO_INVALID_THEME_FUNCTION_RULE_NAME]: true,
    [UNOCSS_NO_ATOMIC_CLASS_RULE_NAME]: true,
    [UNOCSS_NO_INVALID_APPLY_RULE_NAME]: true,
    [UNOCSS_NO_APPLY_RULE_NAME]: true,
    [UNOCSS_NO_ARBITRARY_VALUE_RULE_NAME]: true,
    [UNOCSS_NO_VARIANT_GROUP_RULE_NAME]: true,
  },
}

const strict: StylelintPluginConfig = {
  plugins: [
    noAtomicClassPlugin,
    noInvalidApplyPlugin,
    noApplyPlugin,
    noArbitraryValuePlugin,
    noThemeFunctionPlugin,
    noInvalidThemeFunctionPlugin,
    noScreenDirectivePlugin,
    noTailwindDirectivePlugin,
    noImportDirectivePlugin,
    noCssLayerPlugin,
    unocssBundle.noAtomicClassPlugin,
    unocssBundle.noInvalidApplyPlugin,
    unocssBundle.noApplyPlugin,
    unocssBundle.noArbitraryValuePlugin,
    ...(unocssBundle.noVariantGroupPlugin ? [unocssBundle.noVariantGroupPlugin] : []),
  ],
  rules: {
    [TAILWINDCSS_NO_ATOMIC_CLASS_RULE_NAME]: true,
    [TAILWINDCSS_NO_INVALID_APPLY_RULE_NAME]: true,
    [TAILWINDCSS_NO_APPLY_RULE_NAME]: true,
    [TAILWINDCSS_NO_ARBITRARY_VALUE_RULE_NAME]: true,
    [TAILWINDCSS_NO_THEME_FUNCTION_RULE_NAME]: true,
    [TAILWINDCSS_NO_INVALID_THEME_FUNCTION_RULE_NAME]: true,
    [TAILWINDCSS_NO_SCREEN_DIRECTIVE_RULE_NAME]: true,
    [TAILWINDCSS_NO_TAILWIND_DIRECTIVE_RULE_NAME]: true,
    [TAILWINDCSS_NO_IMPORT_DIRECTIVE_RULE_NAME]: true,
    [TAILWINDCSS_NO_CSS_LAYER_RULE_NAME]: true,
    [UNOCSS_NO_ATOMIC_CLASS_RULE_NAME]: true,
    [UNOCSS_NO_INVALID_APPLY_RULE_NAME]: true,
    [UNOCSS_NO_APPLY_RULE_NAME]: true,
    [UNOCSS_NO_ARBITRARY_VALUE_RULE_NAME]: true,
    [UNOCSS_NO_VARIANT_GROUP_RULE_NAME]: true,
  },
}

const tailwindBase = createBaseConfig(
  {
    noAtomicClassPlugin,
    noInvalidApplyPlugin,
  },
  {
    noAtomicClass: TAILWINDCSS_NO_ATOMIC_CLASS_RULE_NAME,
    noInvalidApply: TAILWINDCSS_NO_INVALID_APPLY_RULE_NAME,
  },
)

const tailwindRecommended = createRecommendedConfig(
  {
    noApplyPlugin,
    noArbitraryValuePlugin,
    noAtomicClassPlugin,
    noInvalidApplyPlugin,
    extraPlugins: [
      noInvalidThemeFunctionPlugin,
    ],
  },
  {
    noApply: TAILWINDCSS_NO_APPLY_RULE_NAME,
    noArbitraryValue: TAILWINDCSS_NO_ARBITRARY_VALUE_RULE_NAME,
    noAtomicClass: TAILWINDCSS_NO_ATOMIC_CLASS_RULE_NAME,
    noInvalidApply: TAILWINDCSS_NO_INVALID_APPLY_RULE_NAME,
    extraRules: [
      TAILWINDCSS_NO_INVALID_THEME_FUNCTION_RULE_NAME,
    ],
  },
)

const tailwindStrict = createRecommendedConfig(
  {
    noApplyPlugin,
    noArbitraryValuePlugin,
    noAtomicClassPlugin,
    noInvalidApplyPlugin,
    extraPlugins: [
      noThemeFunctionPlugin,
      noInvalidThemeFunctionPlugin,
      noScreenDirectivePlugin,
      noTailwindDirectivePlugin,
      noImportDirectivePlugin,
      noCssLayerPlugin,
    ],
  },
  {
    noApply: TAILWINDCSS_NO_APPLY_RULE_NAME,
    noArbitraryValue: TAILWINDCSS_NO_ARBITRARY_VALUE_RULE_NAME,
    noAtomicClass: TAILWINDCSS_NO_ATOMIC_CLASS_RULE_NAME,
    noInvalidApply: TAILWINDCSS_NO_INVALID_APPLY_RULE_NAME,
    extraRules: [
      TAILWINDCSS_NO_THEME_FUNCTION_RULE_NAME,
      TAILWINDCSS_NO_INVALID_THEME_FUNCTION_RULE_NAME,
      TAILWINDCSS_NO_SCREEN_DIRECTIVE_RULE_NAME,
      TAILWINDCSS_NO_TAILWIND_DIRECTIVE_RULE_NAME,
      TAILWINDCSS_NO_IMPORT_DIRECTIVE_RULE_NAME,
      TAILWINDCSS_NO_CSS_LAYER_RULE_NAME,
    ],
  },
)

const unocssBase = createBaseConfig(
  {
    noAtomicClassPlugin: unocssBundle.noAtomicClassPlugin,
    noInvalidApplyPlugin: unocssBundle.noInvalidApplyPlugin,
  },
  {
    noAtomicClass: UNOCSS_NO_ATOMIC_CLASS_RULE_NAME,
    noInvalidApply: UNOCSS_NO_INVALID_APPLY_RULE_NAME,
  },
)

const unocssRecommended = createRecommendedConfig(
  {
    noApplyPlugin: unocssBundle.noApplyPlugin,
    noArbitraryValuePlugin: unocssBundle.noArbitraryValuePlugin,
    noAtomicClassPlugin: unocssBundle.noAtomicClassPlugin,
    noInvalidApplyPlugin: unocssBundle.noInvalidApplyPlugin,
    extraPlugins: unocssBundle.noVariantGroupPlugin
      ? [unocssBundle.noVariantGroupPlugin]
      : [],
  },
  {
    noApply: UNOCSS_NO_APPLY_RULE_NAME,
    noArbitraryValue: UNOCSS_NO_ARBITRARY_VALUE_RULE_NAME,
    noAtomicClass: UNOCSS_NO_ATOMIC_CLASS_RULE_NAME,
    noInvalidApply: UNOCSS_NO_INVALID_APPLY_RULE_NAME,
    extraRules: [UNOCSS_NO_VARIANT_GROUP_RULE_NAME],
  },
)

const unocssStrict = unocssRecommended

const unocssNoAtomicClassPlugin = unocssBundle.noAtomicClassPlugin
const unocssNoInvalidApplyPlugin = unocssBundle.noInvalidApplyPlugin
const unocssNoApplyPlugin = unocssBundle.noApplyPlugin
const unocssNoArbitraryValuePlugin = unocssBundle.noArbitraryValuePlugin
const unocssNoVariantGroupPlugin = unocssBundle.noVariantGroupPlugin

export {
  base,
  noApplyPlugin,
  NO_APPLY_RULE_NAME as noApplyRuleName,
  noArbitraryValuePlugin,
  NO_ARBITRARY_VALUE_RULE_NAME as noArbitraryValueRuleName,
  noAtomicClassPlugin,
  NO_ATOMIC_CLASS_RULE_NAME as noAtomicClassRuleName,
  noCssLayerPlugin,
  TAILWINDCSS_NO_CSS_LAYER_RULE_NAME as noCssLayerRuleName,
  noImportDirectivePlugin,
  TAILWINDCSS_NO_IMPORT_DIRECTIVE_RULE_NAME as noImportDirectiveRuleName,
  noInvalidApplyPlugin,
  NO_INVALID_APPLY_RULE_NAME as noInvalidApplyRuleName,
  noInvalidThemeFunctionPlugin,
  TAILWINDCSS_NO_INVALID_THEME_FUNCTION_RULE_NAME as noInvalidThemeFunctionRuleName,
  noScreenDirectivePlugin,
  TAILWINDCSS_NO_SCREEN_DIRECTIVE_RULE_NAME as noScreenDirectiveRuleName,
  noTailwindDirectivePlugin,
  TAILWINDCSS_NO_TAILWIND_DIRECTIVE_RULE_NAME as noTailwindDirectiveRuleName,
  noThemeFunctionPlugin,
  TAILWINDCSS_NO_THEME_FUNCTION_RULE_NAME as noThemeFunctionRuleName,
  recommended,
  strict,
  tailwindBase,
  TAILWINDCSS_NO_APPLY_RULE_NAME,
  TAILWINDCSS_NO_ARBITRARY_VALUE_RULE_NAME,
  TAILWINDCSS_NO_ATOMIC_CLASS_RULE_NAME,
  TAILWINDCSS_NO_CSS_LAYER_RULE_NAME,
  TAILWINDCSS_NO_IMPORT_DIRECTIVE_RULE_NAME,
  TAILWINDCSS_NO_INVALID_APPLY_RULE_NAME,
  TAILWINDCSS_NO_INVALID_THEME_FUNCTION_RULE_NAME,
  TAILWINDCSS_NO_SCREEN_DIRECTIVE_RULE_NAME,
  TAILWINDCSS_NO_TAILWIND_DIRECTIVE_RULE_NAME,
  TAILWINDCSS_NO_THEME_FUNCTION_RULE_NAME,
  tailwindRecommended,
  tailwindStrict,
  unocssBundle as unoBundle,
  UNOCSS_NO_APPLY_RULE_NAME,
  UNOCSS_NO_ARBITRARY_VALUE_RULE_NAME,
  UNOCSS_NO_ATOMIC_CLASS_RULE_NAME,
  UNOCSS_NO_INVALID_APPLY_RULE_NAME,
  UNOCSS_NO_VARIANT_GROUP_RULE_NAME,
  unocssBase,
  unocssBundle,
  unocssNoApplyPlugin,
  UNOCSS_NO_APPLY_RULE_NAME as unocssNoApplyRuleName,
  unocssNoArbitraryValuePlugin,
  UNOCSS_NO_ARBITRARY_VALUE_RULE_NAME as unocssNoArbitraryValueRuleName,
  unocssNoAtomicClassPlugin,
  UNOCSS_NO_ATOMIC_CLASS_RULE_NAME as unocssNoAtomicClassRuleName,
  unocssNoInvalidApplyPlugin,
  UNOCSS_NO_INVALID_APPLY_RULE_NAME as unocssNoInvalidApplyRuleName,
  unocssNoVariantGroupPlugin,
  UNOCSS_NO_VARIANT_GROUP_RULE_NAME as unocssNoVariantGroupRuleName,
  unocssBundle as unocssPlugins,
  unocssRecommended,
  unocssStrict,
  unocssBundle as unoPlugins,
}
export type { Warning }

export default recommended
