import type { Config as StylelintConfig } from 'stylelint'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import stylelint from 'stylelint'
import {
  noApplyRuleName,
  noArbitraryValueRuleName,
  noAtomicClassRuleName,
  noCssLayerRuleName,
  noInvalidApplyRuleName,
  noInvalidThemeFunctionRuleName,
  noScreenDirectiveRuleName,
  noThemeFunctionRuleName,
  unocssNoApplyRuleName,
  unocssNoArbitraryValueRuleName,
  unocssNoAtomicClassRuleName,
  unocssNoInvalidApplyRuleName,
  unocssNoVariantGroupRuleName,
} from 'stylelint-plugin-tailwindcss'
import { PRESET_RECESS_ORDER, PRESET_VUE_SCSS } from '@/constants'
import { createStylelintConfig, icebreaker } from '@/index'

const ROOT_DIR = path.resolve(__dirname, '..')
const FIXTURE_DIR = path.join(ROOT_DIR, 'fixtures')

describe('stylelint integration', () => {
  it('uses prefix media feature notation to stay aligned with prettier output', async () => {
    const validResult = await stylelint.lint({
      code: [
        '@media (max-width: 480px) {',
        '  .demo {',
        '    color: red;',
        '  }',
        '}',
      ].join('\n'),
      codeFilename: path.join(FIXTURE_DIR, 'media-query.css'),
      config: icebreaker() as StylelintConfig,
    })
    const invalidResult = await stylelint.lint({
      code: [
        '@media (width <= 480px) {',
        '  .demo {',
        '    color: red;',
        '  }',
        '}',
      ].join('\n'),
      codeFilename: path.join(FIXTURE_DIR, 'media-query.css'),
      config: icebreaker() as StylelintConfig,
    })

    expect(validResult.errored).toBe(false)
    expect(validResult.results[0]?.warnings ?? []).toEqual([])

    const mediaWarnings = (invalidResult.results[0]?.warnings ?? []).filter(
      warning => warning.rule === 'media-feature-range-notation',
    )

    expect(invalidResult.errored).toBe(true)
    expect(mediaWarnings).toHaveLength(1)
  })

  it('applies safe formatting fixes when formattingPreset is enabled', async () => {
    const result = await stylelint.lint({
      code: [
        '.page-shell[data-state=open] {',
        '  margin-top: 1px;',
        '  margin-right: 2px;',
        '  margin-bottom: 1px;',
        '  margin-left: 2px;',
        '  color: rgba(0, 0, 0, 0.5);',
        '  background-image: url(icon.png);',
        '}',
      ].join('\n'),
      codeFilename: path.join(FIXTURE_DIR, 'formatting.css'),
      config: createStylelintConfig({
        formattingPreset: 'safe',
      }) as StylelintConfig,
      fix: true,
    })

    expect(result.errored).toBe(false)
    expect(result.code).toBe([
      '.page-shell[data-state="open"] {',
      '  margin: 1px 2px;',
      '  color: rgb(0 0 0 / 50%);',
      '  background-image: url("icon.png");',
      '}',
    ].join('\n'))
    expect(result.results[0]?.warnings ?? []).toEqual([])
  })

  it('reports vendor-prefixed properties as warnings by default', async () => {
    const result = await stylelint.lint({
      code: [
        '.heading-title {',
        '  color: transparent;',
        '  -webkit-background-clip: text;',
        '}',
      ].join('\n'),
      codeFilename: path.join(FIXTURE_DIR, 'vendor-prefix.css'),
      config: icebreaker() as StylelintConfig,
    })

    const warnings = (result.results[0]?.warnings ?? []).filter(
      warning => warning.rule === 'property-no-vendor-prefix',
    )

    expect(result.errored).toBe(false)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.severity).toBe('warning')
    expect(warnings[0]?.text).toContain('-webkit-background-clip')
  })

  it('allows vendor-prefixed properties in mini program configs', async () => {
    const result = await stylelint.lint({
      code: [
        '.heading-title {',
        '  color: transparent;',
        '  -webkit-background-clip: text;',
        '}',
      ].join('\n'),
      codeFilename: path.join(FIXTURE_DIR, 'vendor-prefix.wxss'),
      config: createStylelintConfig({
        miniProgram: true,
      }) as StylelintConfig,
    })

    const warnings = (result.results[0]?.warnings ?? []).filter(
      warning => warning.rule === 'property-no-vendor-prefix',
    )

    expect(result.errored).toBe(false)
    expect(warnings).toHaveLength(0)
  })

  it('allows safe formatting rules to be explicitly disabled by user overrides', async () => {
    const input = [
      '.page-shell[data-state=open] {',
      '  margin-top: 1px;',
      '  margin-right: 2px;',
      '  margin-bottom: 1px;',
      '  margin-left: 2px;',
      '  color: rgba(0, 0, 0, 0.5);',
      '  background-image: url(icon.png);',
      '}',
    ].join('\n')

    const result = await stylelint.lint({
      code: input,
      codeFilename: path.join(FIXTURE_DIR, 'formatting-off.css'),
      config: createStylelintConfig({
        rules: {
          'alpha-value-notation': null,
          'color-function-alias-notation': null,
          'color-function-notation': null,
          'declaration-block-no-redundant-longhand-properties': null,
          'function-url-quotes': null,
          'selector-attribute-quotes': null,
        },
      }) as StylelintConfig,
      fix: true,
    })

    expect(result.code).toBe(input)
  })

  it('allows safe formatting rules to be selectively overridden', async () => {
    const result = await stylelint.lint({
      code: '.page-shell[data-state=open] { background-image: url(icon.png); }',
      codeFilename: path.join(FIXTURE_DIR, 'formatting-override.css'),
      config: createStylelintConfig({
        formattingPreset: 'safe',
        rules: {
          'function-url-quotes': 'never',
        },
      }) as StylelintConfig,
      fix: true,
    })

    expect(result.errored).toBe(false)
    expect(result.code).toBe('.page-shell[data-state="open"] { background-image: url(icon.png); }')
    expect(result.results[0]?.warnings ?? []).toEqual([])
  })

  it('ignores rpx, page, and unocss at-rules by default', async () => {
    const result = await stylelint.lint({
      code: [
        'page {',
        '  width: 10rpx;',
        '}',
        '',
        '@unocss preflights;',
      ].join('\n'),
      codeFilename: path.join(FIXTURE_DIR, 'sample.css'),
      config: icebreaker() as StylelintConfig,
    })

    const warnings = result.results[0]?.warnings ?? []
    expect(result.errored).toBe(false)
    expect(warnings.some(warning => warning.text.includes('unocss'))).toBe(false)
  })

  it('reports Tailwind utility selector declarations by default', async () => {
    const result = await stylelint.lint({
      code: [
        '.page-shell {',
        '  display: block;',
        '}',
        '',
        '.flex {',
        '  display: flex;',
        '}',
      ].join('\n'),
      codeFilename: path.join(FIXTURE_DIR, 'sample.css'),
      config: icebreaker() as StylelintConfig,
    })

    const warnings = (result.results[0]?.warnings ?? []).filter(
      warning => warning.rule === noAtomicClassRuleName,
    )

    expect(result.errored).toBe(true)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.text).toContain('.flex')
  })

  it('wires UnoCSS utility selector validation by default', async () => {
    const config = icebreaker() as StylelintConfig
    const result = await stylelint.lint({
      code: [
        '.page-shell {',
        '  display: block;',
        '}',
        '',
        '.flex {',
        '  display: flex;',
        '}',
      ].join('\n'),
      codeFilename: path.join(FIXTURE_DIR, 'unocss', 'sample.css'),
      config: {
        ...config,
        rules: {
          ...config.rules,
          [noAtomicClassRuleName]: false,
        },
      },
    })

    const warnings = (result.results[0]?.warnings ?? []).filter(
      warning => warning.rule === unocssNoAtomicClassRuleName,
    )

    expect(result.errored).toBe(true)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.text).toContain('.flex')
  })

  it('reports invalid @apply candidates by default', async () => {
    const result = await stylelint.lint({
      code: [
        '.button {',
        '  @apply bg-rd-500 rounded-lg;',
        '}',
      ].join('\n'),
      codeFilename: path.join(FIXTURE_DIR, 'sample.css'),
      config: createStylelintConfig({
        tailwindcssPreset: 'base',
      }) as StylelintConfig,
    })

    const warnings = (result.results[0]?.warnings ?? []).filter(
      warning => warning.rule === noInvalidApplyRuleName,
    )

    expect(result.errored).toBe(true)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.text).toContain('bg-rd-500')
  })

  it('reports invalid UnoCSS @apply candidates by default', async () => {
    const result = await stylelint.lint({
      code: [
        '.button {',
        '  @apply bg-rd-500 rounded-lg;',
        '}',
      ].join('\n'),
      codeFilename: path.join(FIXTURE_DIR, 'unocss', 'sample.css'),
      config: createStylelintConfig({
        tailwindcssPreset: 'base',
      }) as StylelintConfig,
    })

    const warnings = (result.results[0]?.warnings ?? []).filter(
      warning => warning.rule === unocssNoInvalidApplyRuleName,
    )

    expect(result.errored).toBe(true)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.text).toContain('bg-rd-500')
  })

  it('reports any @apply usage with the recommended bundled Tailwind preset', async () => {
    const result = await stylelint.lint({
      code: [
        '.button {',
        '  @apply rounded-lg px-4;',
        '}',
      ].join('\n'),
      codeFilename: path.join(FIXTURE_DIR, 'sample.css'),
      config: createStylelintConfig({
        tailwindcssPreset: 'recommended',
      }) as StylelintConfig,
    })

    const warnings = (result.results[0]?.warnings ?? []).filter(
      warning => warning.rule === noApplyRuleName,
    )

    expect(result.errored).toBe(true)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.text).toContain('@apply')
  })

  it('reports any UnoCSS @apply usage with the recommended bundled Tailwind preset', async () => {
    const result = await stylelint.lint({
      code: [
        '.button {',
        '  @apply rounded-lg px-4;',
        '}',
      ].join('\n'),
      codeFilename: path.join(FIXTURE_DIR, 'sample.css'),
      config: createStylelintConfig({
        tailwindcssPreset: 'recommended',
      }) as StylelintConfig,
    })

    const warnings = (result.results[0]?.warnings ?? []).filter(
      warning => warning.rule === unocssNoApplyRuleName,
    )

    expect(result.errored).toBe(true)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.text).toContain('@apply')
  })

  it('reports arbitrary values with the recommended bundled Tailwind preset', async () => {
    const result = await stylelint.lint({
      code: [
        '.button {',
        '  @apply w-[10px] top--10px bg-$brand;',
        '}',
        '',
        '.w-10px {',
        '  width: 10px;',
        '}',
        '',
        '.translate-x-50\\% {',
        '  translate: 50% 0;',
        '}',
        '',
        '.\\[mask-type\\:luminance\\] {',
        '  mask-type: luminance;',
        '}',
      ].join('\n'),
      codeFilename: path.join(FIXTURE_DIR, 'sample.css'),
      config: createStylelintConfig({
        tailwindcssPreset: 'recommended',
      }) as StylelintConfig,
    })

    const warnings = (result.results[0]?.warnings ?? []).filter(
      warning => warning.rule === noArbitraryValueRuleName,
    )
    const warningTexts = warnings.map(warning => warning.text)

    expect(result.errored).toBe(true)
    expect(warnings).toHaveLength(2)
    expect(warningTexts.some(text => text.includes('w-[10px]'))).toBe(true)
    expect(warningTexts.some(text => text.includes('[mask-type:luminance]'))).toBe(true)
  })

  it('reports UnoCSS arbitrary values with the recommended bundled Tailwind preset', async () => {
    const result = await stylelint.lint({
      code: [
        '.button {',
        '  @apply w-[10px] top--10px bg-$brand;',
        '}',
        '',
        '.w-10px {',
        '  width: 10px;',
        '}',
        '',
        '.translate-x-50\\% {',
        '  translate: 50% 0;',
        '}',
        '',
        '.\\[mask-type\\:luminance\\] {',
        '  mask-type: luminance;',
        '}',
      ].join('\n'),
      codeFilename: path.join(FIXTURE_DIR, 'sample.css'),
      config: createStylelintConfig({
        tailwindcssPreset: 'recommended',
      }) as StylelintConfig,
    })

    const warnings = (result.results[0]?.warnings ?? []).filter(
      warning => warning.rule === unocssNoArbitraryValueRuleName,
    )
    const warningTexts = warnings.map(warning => warning.text)

    expect(result.errored).toBe(true)
    expect(warnings).toHaveLength(6)
    expect(warningTexts.some(text => text.includes('w-10px'))).toBe(true)
    expect(warningTexts.some(text => text.includes('top--10px'))).toBe(true)
    expect(warningTexts.some(text => text.includes('bg-$brand'))).toBe(true)
    expect(warningTexts.some(text => text.includes('translate-x-50%'))).toBe(true)
    expect(warningTexts.some(text => text.includes('w-[10px]'))).toBe(true)
    expect(warningTexts.some(text => text.includes('[mask-type:luminance]'))).toBe(true)
  })

  it('reports invalid theme() paths with the recommended bundled Tailwind preset', async () => {
    const result = await stylelint.lint({
      code: [
        '.button {',
        '  color: theme(colors.gray.900 / 75%);',
        '  background: theme(colors.not-exist.123);',
        '}',
      ].join('\n'),
      codeFilename: path.join(FIXTURE_DIR, 'sample.css'),
      config: createStylelintConfig({
        tailwindcssPreset: 'recommended',
      }) as StylelintConfig,
    })

    const themeWarnings = (result.results[0]?.warnings ?? []).filter(
      warning => warning.rule === noThemeFunctionRuleName,
    )
    const invalidThemeWarnings = (result.results[0]?.warnings ?? []).filter(
      warning => warning.rule === noInvalidThemeFunctionRuleName,
    )

    expect(themeWarnings).toHaveLength(0)
    expect(invalidThemeWarnings).toHaveLength(1)
    expect(invalidThemeWarnings[0]?.text).toContain('colors.not-exist.123')
  })

  it('does not report Tailwind directives by default', async () => {
    const result = await stylelint.lint({
      code: [
        '@import "tailwindcss";',
        '@tailwind utilities;',
        '@screen md {',
        '  .demo {',
        '    color: red;',
        '  }',
        '}',
        '@layer utilities {',
        '  .demo {',
        '    color: red;',
        '  }',
        '}',
      ].join('\n'),
      codeFilename: path.join(FIXTURE_DIR, 'sample.scss'),
      customSyntax: 'postcss-scss',
      config: icebreaker() as StylelintConfig,
    })

    const warnings = result.results[0]?.warnings ?? []

    expect(warnings.some(warning => warning.rule === noScreenDirectiveRuleName)).toBe(false)
    expect(warnings.some(warning => warning.rule === noCssLayerRuleName)).toBe(false)
  })

  it('reports UnoCSS variant groups with the recommended bundled Tailwind preset', async () => {
    const result = await stylelint.lint({
      code: [
        '.button {',
        '  @apply hover:(bg-red-500 text-white);',
        '}',
      ].join('\n'),
      codeFilename: path.join(FIXTURE_DIR, 'sample.css'),
      config: createStylelintConfig({
        tailwindcssPreset: 'recommended',
      }) as StylelintConfig,
    })

    const warnings = (result.results[0]?.warnings ?? []).filter(
      warning => warning.rule === unocssNoVariantGroupRuleName,
    )

    expect(warnings).toHaveLength(1)
  })

  it('supports the strict bundled Tailwind preset layer', async () => {
    const result = await stylelint.lint({
      code: [
        '@import "tailwindcss";',
        '@tailwind utilities;',
      ].join('\n'),
      codeFilename: path.join(FIXTURE_DIR, 'sample.css'),
      config: createStylelintConfig({
        tailwindcssPreset: 'strict',
      }) as StylelintConfig,
    })

    const warnings = result.results[0]?.warnings ?? []

    expect(warnings.some(warning => warning.rule === 'tailwindcss/no-import-directive')).toBe(true)
    expect(warnings.some(warning => warning.rule === 'tailwindcss/no-tailwind-directive')).toBe(true)
  })

  it('replaces ignore units and reports rpx when removed', async () => {
    const result = await stylelint.lint({
      code: [
        '.btn {',
        '  width: 1rpx;',
        '  height: 1upx;',
        '}',
      ].join('\n'),
      codeFilename: path.join(FIXTURE_DIR, 'sample.css'),
      config: createStylelintConfig({
        ignores: {
          units: ['upx'],
        },
      }) as StylelintConfig,
    })

    const unitWarnings = (result.results[0]?.warnings ?? []).filter(
      warning => warning.rule === 'unit-no-unknown',
    )

    expect(result.errored).toBe(true)
    expect(unitWarnings.length).toBe(1)
    expect(unitWarnings[0]?.text).toContain('rpx')
  })

  it('replaces at-rule ignores and keeps appended entries', async () => {
    const result = await stylelint.lint({
      code: [
        '@unocss preflights;',
        '@uno-layer utilities;',
      ].join('\n'),
      codeFilename: path.join(FIXTURE_DIR, 'sample.scss'),
      customSyntax: 'postcss-scss',
      config: createStylelintConfig({
        ignores: {
          atRules: ['tailwind'],
          addAtRules: ['uno-layer'],
        },
      }) as StylelintConfig,
    })

    const atRuleWarnings = (result.results[0]?.warnings ?? []).filter(
      warning => warning.rule === 'scss/at-rule-no-unknown',
    )

    expect(atRuleWarnings.some(warning => warning.text.includes('unocss')))
      .toBe(true)
    expect(atRuleWarnings.some(warning => warning.text.includes('uno-layer')))
      .toBe(false)
  })

  it('drops vue/order presets when disabled', () => {
    const config = createStylelintConfig({
      presets: {
        vue: false,
        order: false,
      },
    })
    const extendsList = Array.isArray(config.extends)
      ? config.extends
      : config.extends
        ? [config.extends]
        : []

    expect(
      extendsList.some(entry => String(entry).includes(PRESET_VUE_SCSS)),
    ).toBe(false)
    expect(
      extendsList.some(entry => String(entry).includes(PRESET_RECESS_ORDER)),
    ).toBe(false)
  })

  it('ignores mini program build outputs when miniProgram is enabled', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'icebreaker-stylelint-ignore-'))
    const ignoredFile = path.join(tempDir, '.weapp-vite', 'app.wxss')

    await fs.mkdir(path.dirname(ignoredFile), { recursive: true })
    await fs.writeFile(ignoredFile, '.demo { color: #f00; unknown-prop: 1rpx; }\n', 'utf8')

    try {
      const result = await stylelint.lint({
        cwd: tempDir,
        files: ignoredFile,
        config: createStylelintConfig({
          miniProgram: true,
        }) as StylelintConfig,
      })

      expect(result.results).toHaveLength(1)
      expect(result.results[0]?.errored).toBe(false)
      expect(result.results[0]?.warnings).toEqual([])
    }
    finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('writes vscode settings via the cli entry', async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'icebreaker-stylelint-'),
    )
    const previousCwd = process.cwd()

    process.chdir(tempDir)
    try {
      vi.resetModules()
      await import('@/cli')

      const settingsPath = path.join(tempDir, '.vscode', 'settings.json')
      const settings = await fs.readFile(settingsPath, 'utf8')
      expect(settings).toContain('stylelint.validate')
    }
    finally {
      process.chdir(previousCwd)
    }
  })
})
