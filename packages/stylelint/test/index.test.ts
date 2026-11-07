import { PRESET_RECESS_ORDER, PRESET_STANDARD_SCSS, PRESET_VUE_SCSS } from '@/constants'
import { createStylelintConfig, icebreaker } from '@/index'
import { setVscodeSettingsJson } from '@/shared'

function normalizePresetPath(value: string) {
  const normalizedValue = value.replaceAll('\\', '/')

  if (normalizedValue.includes(PRESET_STANDARD_SCSS)) {
    return PRESET_STANDARD_SCSS
  }
  if (normalizedValue.includes('stylelint-config-recommended-vue.mjs')) {
    return PRESET_VUE_SCSS
  }
  if (normalizedValue.includes(PRESET_RECESS_ORDER)) {
    return PRESET_RECESS_ORDER
  }
  return normalizedValue
}

function normalizeConfigForSnapshot(config: ReturnType<typeof icebreaker>) {
  const extendsList = Array.isArray(config.extends)
    ? config.extends
    : config.extends
      ? [config.extends]
      : []

  const plugins = Array.isArray(config.plugins)
    ? config.plugins
    : config.plugins
      ? [config.plugins]
      : []

  return {
    ...config,
    extends: extendsList.map((item) => {
      return typeof item === 'string' ? normalizePresetPath(item) : item
    }),
    plugins: plugins.map((_, index) => {
      if (index === 0) {
        return 'stylelint-plugin-tailwindcss'
      }
      if (index === 1) {
        return 'stylelint-plugin-tailwindcss/no-invalid-apply'
      }
      if (index === 2) {
        return 'stylelint-plugin-tailwindcss/unocss/no-atomic-class'
      }
      if (index === 3) {
        return 'stylelint-plugin-tailwindcss/unocss/no-invalid-apply'
      }
      return `plugin-${index}`
    }),
  }
}

describe('index', () => {
  it('setVscodeSettingsJson case 0', () => {
    expect(setVscodeSettingsJson()).toMatchSnapshot()
  })

  it('setVscodeSettingsJson case 1', () => {
    expect(setVscodeSettingsJson({
      'stylelint.validate': [
        'vue',
        'scss',
        'css',
      ],
    })).toMatchSnapshot()
  })

  it('setVscodeSettingsJson removes style languages from eslint.validate', () => {
    expect(setVscodeSettingsJson({
      'eslint.validate': [
        'javascript',
        'css',
        'scss',
        'postcss',
        'markdown',
      ],
    })).toMatchSnapshot()
  })

  it('common', () => {
    const config = icebreaker()

    expect((config.extends as string[]).map(normalizePresetPath)).toEqual([
      expect.stringContaining(PRESET_STANDARD_SCSS),
      PRESET_VUE_SCSS,
      expect.stringContaining(PRESET_RECESS_ORDER),
    ])
    expect(config.plugins).toHaveLength(4)

    expect(normalizeConfigForSnapshot(config)).toMatchSnapshot()
  })

  it('createStylelintConfig toggles presets', () => {
    const config = createStylelintConfig({
      presets: {
        vue: false,
        order: false,
      },
      extends: 'my-custom-config',
    })

    expect((config.extends as string[]).map(normalizePresetPath)).toEqual([
      expect.stringContaining(PRESET_STANDARD_SCSS),
      'my-custom-config',
    ])
  })

  it('createStylelintConfig custom ignores', () => {
    const config = createStylelintConfig({
      ignores: {
        units: [],
        addUnits: ['upx'],
        atRules: ['tailwind'],
        addAtRules: ['uno-layer'],
      },
    })

    expect(config.rules?.['unit-no-unknown']).toEqual([
      true,
      {
        ignoreUnits: ['upx'],
      },
    ])

    expect(config.rules?.['scss/at-rule-no-unknown']).toEqual([
      true,
      {
        ignoreAtRules: [
          'tailwind',
          'uno-layer',
        ],
      },
    ])
  })

  it('merges overrides in icebreaker configs', () => {
    const config = icebreaker({
      miniProgram: true,
      plugins: ['custom-plugin'],
      rules: {
        'selector-class-pattern': null,
      },
    })

    expect(config.plugins).toHaveLength(5)
    expect(config.rules?.['selector-class-pattern']).toBeNull()
    expect(config.ignoreFiles).toEqual([
      'dist/**',
      '.weapp-vite/**',
      'node_modules/**',
      'miniprogram_npm/**',
    ])
  })

  it('adds safe formatting rules when formattingPreset is enabled', () => {
    const config = createStylelintConfig({
      formattingPreset: 'safe',
    })

    expect(config.rules?.['color-function-notation']).toBe('modern')
    expect(config.rules?.['function-url-quotes']).toBe('always')
    expect(config.rules?.['selector-attribute-quotes']).toBe('always')
    expect(config.rules?.['declaration-block-no-redundant-longhand-properties']).toBe(true)
    expect(config.rules?.['shorthand-property-no-redundant-values']).toBe(true)
  })

  it('does not add safe formatting rules when formattingPreset is off', () => {
    const config = createStylelintConfig({
      formattingPreset: 'off',
    })

    expect(config.rules?.['color-function-notation']).toBeUndefined()
    expect(config.rules?.['function-url-quotes']).toBeUndefined()
    expect(config.rules?.['selector-attribute-quotes']).toBeUndefined()
    expect(config.rules?.['declaration-block-no-redundant-longhand-properties']).toBeUndefined()
    expect(config.rules?.['shorthand-property-no-redundant-values']).toBeUndefined()
  })

  it('lets user rules override safe formatting preset defaults', () => {
    const config = createStylelintConfig({
      formattingPreset: 'safe',
      rules: {
        'function-url-quotes': 'never',
        'selector-attribute-quotes': 'never',
      },
    })

    expect(config.rules?.['function-url-quotes']).toBe('never')
    expect(config.rules?.['selector-attribute-quotes']).toBe('never')
    expect(config.rules?.['color-function-notation']).toBe('modern')
  })
})
