import type { Linter } from 'eslint'
import type { UserDefinedOptions } from '@/types'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { icebreaker } from '@/index'
import { __applyVueVersionSpecificRules, __inferPrettierEndOfLineFromEditorConfig, __isPackageAvailable, __parseEditorConfig, __resolveFormattersOption, createBaseRuleSet, resolveUserOptions } from '@/options'

function toFormatterOptions(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected formatter options to resolve to an object')
  }

  return value as Record<string, unknown>
}

function getFormatterRuleOptions(
  configs: unknown[],
  name: string,
  ruleId?: 'format/prettier' | 'format/oxfmt',
): Record<string, unknown> {
  const config = (configs as Linter.Config[]).find(item => item.name === name)

  expect(config).toBeDefined()
  const resolvedRuleId = ruleId
    ?? ((config?.rules?.['format/oxfmt'] ? 'format/oxfmt' : 'format/prettier') as 'format/prettier' | 'format/oxfmt')
  const rule = config?.rules?.[resolvedRuleId]

  expect(Array.isArray(rule)).toBe(true)

  return (rule as unknown[])[1] as Record<string, unknown>
}

describe('resolveUserOptions', () => {
  it('expands boolean feature flags into config objects', () => {
    const resolved = resolveUserOptions({ vue: true, typescript: true })

    const resolvedVue = resolved.vue
    const resolvedTypescript = resolved.typescript

    if (!resolvedVue || typeof resolvedVue === 'boolean') {
      throw new Error('Expected vue options to resolve to an object')
    }

    if (!resolvedTypescript || typeof resolvedTypescript === 'boolean') {
      throw new Error('Expected typescript options to resolve to an object')
    }

    expect(resolvedVue.overrides?.['vue/no-useless-v-bind']).toBeDefined()
    expect(resolvedVue.overrides?.['vue/no-v-for-template-key-on-child']).toBe('error')
    expect(resolvedVue.overrides?.['vue/no-v-for-template-key']).toBe('off')
    expect(resolvedTypescript.overrides?.['ts/no-unused-vars']).toBeDefined()
    expect(resolved.formatters).not.toBe(false)
  })

  it('keeps vue disabled when not configured', () => {
    const resolved = resolveUserOptions()

    expect(resolved.vue).toBeUndefined()

    const resolvedTypescript = resolved.typescript
    if (!resolvedTypescript || typeof resolvedTypescript === 'boolean') {
      throw new Error('Expected typescript options to resolve to an object')
    }
    expect(resolvedTypescript.overrides?.['ts/no-unused-vars']).toBeDefined()
  })

  it('keeps disabled feature flags as false', () => {
    const resolved = resolveUserOptions({ vue: false, typescript: false })

    expect(resolved.vue).toBe(false)
    expect(resolved.typescript).toBe(false)
  })

  it('normalizes miniProgram and legacy weapp into one flag', () => {
    expect(resolveUserOptions({ miniProgram: true }).miniProgram).toBe(true)

    const resolvedLegacy = resolveUserOptions({ weapp: true })
    expect(resolvedLegacy.miniProgram).toBe(true)
    expect(resolvedLegacy.weapp).toBeUndefined()
  })

  it('normalizes legacy object tailwindcss options into betterTailwindcss', () => {
    const resolved = resolveUserOptions({
      tailwindcss: {
        entryPoint: './src/tailwind.css',
      },
    } as unknown as UserDefinedOptions)

    expect(resolved.tailwindcss).toBeUndefined()
    expect(resolved.betterTailwindcss).toEqual({
      entryPoint: './src/tailwind.css',
    })
  })

  it('applies vue2 specific overrides when requested', () => {
    const resolved = resolveUserOptions({
      vue: {
        vueVersion: 2,
        overrides: {},
      },
    })

    const resolvedVue = resolved.vue
    if (!resolvedVue || typeof resolvedVue === 'boolean') {
      throw new Error('Expected vue options to resolve to an object')
    }

    expect(resolvedVue.overrides?.['vue/no-v-for-template-key-on-child']).toBe('off')
    expect(resolvedVue.overrides?.['vue/no-deprecated-v-bind-sync']).toBe('off')
  })

  it('merges custom typescript overrides with the defaults', () => {
    const resolved = resolveUserOptions({
      typescript: {
        overrides: {
          'ts/custom-rule': 'error',
        },
      },
    })

    const resolvedTypescript = resolved.typescript
    if (!resolvedTypescript || typeof resolvedTypescript === 'boolean') {
      throw new Error('Expected typescript options to resolve to an object')
    }

    expect(resolvedTypescript.overrides?.['ts/custom-rule']).toBe('error')
    expect(resolvedTypescript.overrides?.['ts/no-unused-expressions']).toBeDefined()
  })

  it('merges custom vue overrides with the defaults', () => {
    const resolved = resolveUserOptions({
      vue: {
        overrides: {
          'vue/custom-rule': 'warn',
        },
      },
    })

    const resolvedVue = resolved.vue
    if (!resolvedVue || typeof resolvedVue === 'boolean') {
      throw new Error('Expected vue options to resolve to an object')
    }

    expect(resolvedVue.overrides?.['vue/custom-rule']).toBe('warn')
    expect(resolvedVue.overrides?.['vue/no-useless-v-bind']).toBeDefined()
  })

  it('deep merges formatter options with the defaults', () => {
    const resolved = resolveUserOptions({
      formatters: {
        prettierOptions: {
          endOfLine: 'lf',
        },
      },
    })

    const formatters = toFormatterOptions(resolved.formatters)
    const prettierOptions = toFormatterOptions(formatters['prettierOptions'])

    expect(formatters['css']).toBe(true)
    expect(formatters['html']).toBe(true)
    expect(formatters['markdown']).toBe(true)
    expect(formatters['graphql']).toBe(true)
    expect(prettierOptions['endOfLine']).toBe('lf')
  })

  it('keeps formatter overrides while preserving remaining defaults', () => {
    const resolved = resolveUserOptions({
      formatters: {
        markdown: false,
      },
    })

    const formatters = toFormatterOptions(resolved.formatters)

    expect(formatters['css']).toBe(true)
    expect(formatters['html']).toBe(true)
    expect(formatters['graphql']).toBe(true)
    expect(formatters['markdown']).toBe(false)
  })
})

describe('createBaseRuleSet', () => {
  it('returns the default rules in modern mode', () => {
    expect(createBaseRuleSet(false)['unicorn/prefer-number-properties']).toBe('warn')
    expect(createBaseRuleSet(false)['dot-notation']).toBe('off')
    expect(createBaseRuleSet(false)['e18e/ban-dependencies']).toEqual(['warn', {
      allowed: [
        'axios',
        'lefthook',
      ],
    }])
    expect(createBaseRuleSet(false)['e18e/prefer-array-to-sorted']).toBe('off')
  })

  it('disables perfectionist sorting in legacy mode', () => {
    expect(createBaseRuleSet(true)['perfectionist/sort-imports']).toBe('off')
  })
})

describe('applyVueVersionSpecificRules', () => {
  it('skips processing when option is not an object', () => {
    expect(() => __applyVueVersionSpecificRules(false)).not.toThrow()
  })

  it('skips processing when overrides are missing', () => {
    const option = { overrides: undefined } as any
    __applyVueVersionSpecificRules(option)
    expect(option.overrides).toBeUndefined()
  })
})

describe('isPackageAvailable', () => {
  it('supports package resolution with and without custom paths', () => {
    expect(__isPackageAvailable('eslint')).toBe(true)
    expect(__isPackageAvailable('@prettier/plugin-xml', [path.resolve(__dirname, '..')])).toBe(true)
  })

  it('returns false when a package cannot be resolved', () => {
    expect(__isPackageAvailable('@icebreakers/definitely-missing-package')).toBe(false)
  })
})

describe('formatters integration', () => {
  it('returns undefined when no editorconfig can be found', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'icebreaker-no-editorconfig-'))

    try {
      expect(__inferPrettierEndOfLineFromEditorConfig(tempDir)).toBeUndefined()
    }
    finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('ignores non-general editorconfig sections and invalid end_of_line values', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'icebreaker-editorconfig-parse-'))
    const editorConfigPath = path.join(tempDir, '.editorconfig')

    await fs.writeFile(
      editorConfigPath,
      [
        '; comment',
        'root = true',
        'this line has no separator',
        '',
        '[*.md]',
        'end_of_line = crlf',
        '',
        '[*]',
        'end_of_line = invalid',
      ].join('\n'),
      'utf8',
    )

    try {
      expect(__parseEditorConfig(editorConfigPath)).toEqual({
        isRoot: true,
      })
      expect(__inferPrettierEndOfLineFromEditorConfig(tempDir)).toBeUndefined()
    }
    finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('prefers the nearest general editorconfig override before hitting root', async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'icebreaker-editorconfig-nested-'))
    const nestedDir = path.join(rootDir, 'packages', 'demo')

    await fs.mkdir(nestedDir, { recursive: true })
    await fs.writeFile(
      path.join(rootDir, '.editorconfig'),
      [
        'root = true',
        '',
        '[*]',
        'end_of_line = crlf',
      ].join('\n'),
      'utf8',
    )
    await fs.writeFile(
      path.join(rootDir, 'packages', '.editorconfig'),
      [
        '[*]',
        'end_of_line = lf',
      ].join('\n'),
      'utf8',
    )

    try {
      expect(__inferPrettierEndOfLineFromEditorConfig(nestedDir)).toBe('lf')
    }
    finally {
      await fs.rm(rootDir, { recursive: true, force: true })
    }
  })

  it('returns true when formatters are implicit and no editorconfig override exists', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'icebreaker-formatters-default-'))

    try {
      expect(__resolveFormattersOption(undefined, tempDir)).toEqual(expect.objectContaining({
        css: true,
        html: true,
        markdown: true,
        graphql: true,
      }))
    }
    finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('keeps explicit formatter disable flags untouched', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'icebreaker-formatters-false-'))

    try {
      expect(__resolveFormattersOption(false, tempDir)).toBe(false)
    }
    finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('expands explicit formatter true into defaults when editorconfig is present', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'icebreaker-formatters-true-'))

    await fs.writeFile(
      path.join(tempDir, '.editorconfig'),
      [
        'root = true',
        '',
        '[*]',
        'end_of_line = cr',
      ].join('\n'),
      'utf8',
    )

    try {
      const resolved = toFormatterOptions(__resolveFormattersOption(true, tempDir))
      const prettierOptions = toFormatterOptions(resolved['prettierOptions'])

      expect(resolved['css']).toBe(true)
      expect(resolved['markdown']).toBe(true)
      expect(prettierOptions['endOfLine']).toBe('cr')
    }
    finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('inherits formatter endOfLine from .editorconfig', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'icebreaker-editorconfig-'))
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir)

    await fs.writeFile(
      path.join(tempDir, '.editorconfig'),
      [
        'root = true',
        '',
        '[*]',
        'end_of_line = lf',
      ].join('\n'),
      'utf8',
    )

    try {
      expect(__inferPrettierEndOfLineFromEditorConfig()).toBe('lf')

      const configs = await icebreaker().toConfigs()
      const formatterNames = [
        'antfu/formatter/css',
        'antfu/formatter/scss',
        'antfu/formatter/less',
        'antfu/formatter/html',
        'antfu/formatter/markdown',
        'antfu/formatter/graphql',
      ]

      for (const name of formatterNames) {
        expect(getFormatterRuleOptions(configs, name)['endOfLine']).toBe('lf')
      }
    }
    finally {
      cwdSpy.mockRestore()
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('keeps the default formatter configs when only prettierOptions are overridden', async () => {
    const configs = await icebreaker({
      formatters: {
        prettierOptions: {
          endOfLine: 'lf',
        },
      },
    }).toConfigs()

    const formatterNames = [
      'antfu/formatter/setup',
      'antfu/formatter/css',
      'antfu/formatter/scss',
      'antfu/formatter/less',
      'antfu/formatter/html',
      'antfu/formatter/markdown',
      'antfu/formatter/graphql',
    ]

    for (const name of formatterNames) {
      expect(configs.some(config => 'name' in config && config.name === name)).toBe(true)
    }

    expect(getFormatterRuleOptions(configs, 'antfu/formatter/css')['endOfLine']).toBe('lf')
    expect(getFormatterRuleOptions(configs, 'antfu/formatter/markdown')['endOfLine']).toBe('lf')
  })

  it('falls back to normalized defaults for unsupported formatter option shapes', async () => {
    const resolved = toFormatterOptions(__resolveFormattersOption('unexpected' as any))

    expect(resolved['css']).toBe(true)
    expect(resolved['html']).toBe(true)
    expect(resolved['markdown']).toBe(true)
    expect(resolved['graphql']).toBe(true)
  })

  it('overrides css/html/graphql formatter rules to oxfmt when requested', async () => {
    const configs = await icebreaker({
      formatters: {
        css: 'oxfmt',
        html: 'oxfmt',
        graphql: 'oxfmt',
        oxfmtOptions: {
          lineWidth: 90,
        },
      },
    }).toConfigs()

    for (const name of ['antfu/formatter/css', 'antfu/formatter/scss', 'antfu/formatter/less', 'antfu/formatter/html', 'antfu/formatter/graphql']) {
      expect(configs.some(config => 'name' in config && config.name === name)).toBe(true)
      expect(getFormatterRuleOptions(configs, name, 'format/oxfmt')['lineWidth']).toBe(90)
    }
  })

  it('overrides markdown formatter rule to oxfmt when requested', async () => {
    const configs = await icebreaker({
      formatters: {
        markdown: 'oxfmt',
        oxfmtOptions: {
          lineWidth: 88,
        },
      },
    }).toConfigs()

    expect(getFormatterRuleOptions(configs, 'antfu/formatter/markdown', 'format/oxfmt')['lineWidth']).toBe(88)
  })
})
