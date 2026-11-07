import {
  PRESET_RECESS_ORDER,
  PRESET_STANDARD_SCSS,
  PRESET_VUE_SCSS,
} from '@/constants'

async function loadConfig() {
  return import('@/config')
}

const DISABLE_IMPORT_META_RESOLVE_ENV = 'ICEBREAKER_STYLELINT_DISABLE_IMPORT_META_RESOLVE'

function normalizePath(value: string) {
  return value.replaceAll('\\', '/')
}

function expectBundledStandardScssPreset(value: string) {
  expect(normalizePath(value)).toMatch(/\/presets\/stylelint-config-standard-scss\.mjs$/)
}

function normalizeExtendsList(config: { extends?: string | string[] }) {
  const extendsList = Array.isArray(config.extends)
    ? config.extends
    : config.extends
      ? [config.extends]
      : []

  return extendsList.map(normalizePath)
}

async function withImportMetaResolveDisabled<T>(fn: () => Promise<T>): Promise<T> {
  const previousValue = process.env[DISABLE_IMPORT_META_RESOLVE_ENV]
  process.env[DISABLE_IMPORT_META_RESOLVE_ENV] = '1'
  try {
    return await fn()
  }
  finally {
    if (previousValue === undefined) {
      delete process.env[DISABLE_IMPORT_META_RESOLVE_ENV]
    }
    else {
      process.env[DISABLE_IMPORT_META_RESOLVE_ENV] = previousValue
    }
  }
}

describe('createIcebreakerStylelintConfig', () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.doUnmock('node:module')
  })

  it('returns defaults with presets enabled', async () => {
    const { createIcebreakerStylelintConfig } = await loadConfig()
    const config = createIcebreakerStylelintConfig()

    expect(normalizeExtendsList(config)).toEqual([
      expect.stringContaining(PRESET_STANDARD_SCSS),
      expect.stringContaining(PRESET_VUE_SCSS),
      expect.stringContaining(PRESET_RECESS_ORDER),
    ])
    expect(config.plugins).toHaveLength(4)
    expect(config.overrides).toEqual([])
    expect(config.rules?.['selector-class-pattern']).toBeDefined()
    expect(config.rules?.['tailwindcss/no-atomic-class']).toBe(true)
    expect(config.rules?.['tailwindcss/no-invalid-apply']).toBe(true)
    expect(config.rules?.['unocss/no-atomic-class']).toBe(true)
    expect(config.rules?.['unocss/no-invalid-apply']).toBe(true)
    expect(config.rules?.['property-no-vendor-prefix']).toEqual([
      true,
      {
        severity: 'warning',
      },
    ])
    expect(config.rules?.['tailwindcss/no-apply']).toBeUndefined()
    expect(config.rules?.['tailwindcss/no-invalid-theme-function']).toBeUndefined()
    expect(config.rules?.['unocss/no-apply']).toBeUndefined()
    expect(config.rules?.['unocss/no-variant-group']).toBeUndefined()
  })

  it('supports switching the bundled Tailwind policy layer to recommended', async () => {
    const { createIcebreakerStylelintConfig } = await loadConfig()
    const config = createIcebreakerStylelintConfig({
      tailwindcssPreset: 'recommended',
    })

    expect(config.plugins).toHaveLength(10)
    expect(config.rules?.['tailwindcss/no-apply']).toBe(true)
    expect(config.rules?.['tailwindcss/no-arbitrary-value']).toBe(true)
    expect(config.rules?.['tailwindcss/no-invalid-theme-function']).toBe(true)
    expect(config.rules?.['unocss/no-apply']).toBe(true)
    expect(config.rules?.['unocss/no-arbitrary-value']).toBe(true)
    expect(config.rules?.['unocss/no-variant-group']).toBe(true)
  })

  it('supports switching the bundled Tailwind policy layer to strict', async () => {
    const { createIcebreakerStylelintConfig } = await loadConfig()
    const config = createIcebreakerStylelintConfig({
      tailwindcssPreset: 'strict',
    })

    expect(config.plugins).toHaveLength(15)
    expect(config.rules?.['tailwindcss/no-theme-function']).toBe(true)
    expect(config.rules?.['tailwindcss/no-screen-directive']).toBe(true)
    expect(config.rules?.['tailwindcss/no-tailwind-directive']).toBe(true)
    expect(config.rules?.['tailwindcss/no-import-directive']).toBe(true)
    expect(config.rules?.['tailwindcss/no-css-layer']).toBe(true)
  })

  it('toggles presets and merges extends', async () => {
    const { createIcebreakerStylelintConfig } = await loadConfig()
    const config = createIcebreakerStylelintConfig({
      presets: {
        scss: false,
        vue: false,
        order: false,
      },
      extends: [
        'custom',
        'custom',
        'extra',
      ],
    })

    expect(config.extends).toEqual([
      'custom',
      'extra',
    ])
  })

  it('omits extends when all presets are disabled and no custom extends are provided', async () => {
    const { createIcebreakerStylelintConfig } = await loadConfig()
    const config = createIcebreakerStylelintConfig({
      presets: {
        scss: false,
        vue: false,
        order: false,
      },
    })

    expect(config.extends).toBeUndefined()
    expect(config.overrides).toEqual([])
    expect(config.rules).toBeDefined()
  })

  it('merges overrides and rules', async () => {
    const { createIcebreakerStylelintConfig } = await loadConfig()
    const overrides = [
      {
        files: ['**/*.scss'],
        rules: {
          'unit-no-unknown': null,
        },
      },
    ]

    const config = createIcebreakerStylelintConfig({
      overrides,
      ignores: {
        units: ['upx'],
        addUnits: ['rpx'],
        atRules: ['tailwind'],
        addAtRules: ['uno-layer'],
      },
      rules: {
        'selector-class-pattern': null,
      },
    })

    expect(config.overrides).toEqual(overrides)
    expect(config.rules?.['selector-class-pattern']).toBeNull()
    expect(config.rules?.['unit-no-unknown']).toEqual([
      true,
      {
        ignoreUnits: ['upx', 'rpx'],
      },
    ])
    expect(config.rules?.['scss/at-rule-no-unknown']).toEqual([
      true,
      {
        ignoreAtRules: ['tailwind', 'uno-layer'],
      },
    ])
  })

  it('adds mini program ignore files and preserves extra config fields', async () => {
    const { createIcebreakerStylelintConfig } = await loadConfig()
    const config = createIcebreakerStylelintConfig({
      miniProgram: true,
      plugins: ['custom-plugin'],
      customSyntax: 'postcss-html',
      ignoreFiles: ['coverage/**'],
    })

    expect(config.customSyntax).toBe('postcss-html')
    expect(config.plugins).toContain('custom-plugin')
    expect(config.ignoreFiles).toEqual([
      'dist/**',
      '.weapp-vite/**',
      'node_modules/**',
      'miniprogram_npm/**',
      'coverage/**',
    ])
    expect(config.rules?.['property-no-vendor-prefix']).toBeNull()
  })

  it('uses require.resolve when import.meta.resolve is disabled', async () => {
    vi.doMock('node:module', () => {
      return {
        createRequire: () => {
          return {
            resolve: (specifier: string) => `/virtual/${specifier}`,
          }
        },
      }
    })

    const { createIcebreakerStylelintConfig } = await withImportMetaResolveDisabled(loadConfig)
    const config = createIcebreakerStylelintConfig()

    expect(config.extends).toEqual([
      expect.stringMatching(/\/presets\/stylelint-config-standard-scss\.mjs$/),
      `/virtual/${PRESET_VUE_SCSS}`,
      `/virtual/${PRESET_RECESS_ORDER}`,
    ])
  })

  it('falls back to module specifiers when require.resolve fails', async () => {
    vi.doMock('node:module', () => {
      return {
        createRequire: () => {
          return {
            resolve: () => {
              throw new Error('resolve failed')
            },
          }
        },
      }
    })

    const { createIcebreakerStylelintConfig } = await withImportMetaResolveDisabled(loadConfig)
    const config = createIcebreakerStylelintConfig()

    const extendsList = normalizeExtendsList(config)
    expectBundledStandardScssPreset(extendsList[0] ?? '')
    expect(extendsList.slice(1)).toEqual([
      PRESET_VUE_SCSS,
      PRESET_RECESS_ORDER,
    ])
  })
})
