export interface StylelintRuleOptions {
  [key: string]: unknown
}

export type StylelintPlugin = string | object

export type StylelintRuleSetting
  = | null
    | undefined
    | string
    | number
    | boolean
    | RegExp
    | StylelintRuleOptions
    | [unknown]
    | [unknown, StylelintRuleOptions]
    | unknown[]

export interface StylelintOverride {
  files: string | string[]
  name?: string
  customSyntax?: any
  extends?: string | string[]
  plugins?: StylelintPlugin | StylelintPlugin[]
  rules?: Record<string, StylelintRuleSetting>
}

export interface StylelintConfig {
  extends?: string | string[]
  plugins?: StylelintPlugin | StylelintPlugin[]
  overrides?: StylelintOverride[]
  rules?: Record<string, StylelintRuleSetting>
  customSyntax?: any
  ignoreFiles?: string | string[]
}

export interface PresetToggles {
  /** Include rules for SCSS syntax. Enabled by default. */
  scss?: boolean
  /** Include Vue-specific recommendations. Enabled by default. */
  vue?: boolean
  /** Enforce property ordering via recess-order. Enabled by default. */
  order?: boolean
}

export interface IgnoreListOptions {
  /** Replace the default ignore-at-rules list. */
  atRules?: string[]
  /** Replace the default ignore selector types list. */
  types?: string[]
  /** Replace the default ignore units list. */
  units?: string[]
  /** Additional at-rules to ignore. */
  addAtRules?: string[]
  /** Additional selector types to ignore. */
  addTypes?: string[]
  /** Additional units to ignore. */
  addUnits?: string[]
}

export type TailwindcssPresetLevel = 'base' | 'recommended' | 'strict'
export type FormattingPresetLevel = 'off' | 'safe'

export interface IcebreakerStylelintOptions {
  /** Enable Mini Program defaults such as common ignore paths. */
  miniProgram?: boolean
  /** Toggle built-in preset bundles. */
  presets?: PresetToggles
  /** Control the bundled Tailwind/UnoCSS policy layer. */
  tailwindcssPreset?: TailwindcssPresetLevel
  /** 启用在 Stylelint 18 中仍受支持的修复型格式规则。 */
  formattingPreset?: FormattingPresetLevel
  /** Append extra extends entries. */
  extends?: StylelintConfig['extends']
  /** Append override entries. */
  overrides?: StylelintConfig['overrides']
  /** Append plugins. */
  plugins?: StylelintConfig['plugins']
  /** Set a top-level custom syntax. */
  customSyntax?: StylelintConfig['customSyntax']
  /** Append ignoreFiles entries. */
  ignoreFiles?: StylelintConfig['ignoreFiles']
  /** Provide additional or replacement rule ignore lists. */
  ignores?: IgnoreListOptions
  /** Override or add rules. */
  rules?: StylelintConfig['rules']
}

export type ResolvedIgnoreKind = 'atRules' | 'types' | 'units'
