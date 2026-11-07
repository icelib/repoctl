import { describe, expect, it, vi } from 'vitest'
import * as core from '@/core'
import plugin, { createStylelintProcessor, cssProcessor, lintRule } from '@/index'
import {
  __createVueStyleVirtualFilename,
  __extractVueStyleBlocks,
  __mapDiagnosticToVueFile,
  __normalizeStyleLang,
  __parseStyleAttributes,
} from '@/rule'

describe('eslint-plugin-better-stylelint', () => {
  it('exports processors and rules', () => {
    expect(plugin.processors.css).toBe(cssProcessor)
    expect(plugin.rules.stylelint).toBe(lintRule)
  })

  it('processor forwards Stylelint diagnostics', () => {
    const spy = vi.spyOn(core, 'runStylelintSync').mockReturnValue([
      {
        ruleId: 'tailwindcss/no-apply',
        message: 'Unexpected Tailwind CSS @apply directive',
        line: 2,
        column: 3,
        severity: 2,
      },
    ])

    const filename = '/tmp/demo.css'
    cssProcessor.preprocess('.demo { @apply flex; }', filename)
    const messages = cssProcessor.postprocess([], filename)

    expect(spy).toHaveBeenCalledWith('.demo { @apply flex; }', filename, {})
    expect(messages).toHaveLength(1)
    expect(messages[0]?.ruleId).toBe('tailwindcss/no-apply')
  })

  it('custom processor forwards inline stylelint options', () => {
    const spy = vi.spyOn(core, 'runStylelintSync').mockReturnValue([])
    const processor = createStylelintProcessor({
      cwd: '/tmp/project',
      config: {
        rules: {
          'color-named': 'never',
        },
      },
    })
    const filename = '/tmp/demo.css'

    processor.preprocess('.demo { color: red; }', filename)
    processor.postprocess([], filename)

    expect(spy).toHaveBeenCalledWith('.demo { color: red; }', filename, {
      cwd: '/tmp/project',
      config: {
        rules: {
          'color-named': 'never',
        },
      },
    })
  })

  it('vue rule reports Stylelint diagnostics', () => {
    const spy = vi.spyOn(core, 'runStylelintSync').mockReturnValue([
      {
        ruleId: 'tailwindcss/no-apply',
        message: 'Unexpected Tailwind CSS @apply directive',
        line: 2,
        column: 5,
        endLine: 2,
        endColumn: 11,
        severity: 2,
      },
    ])

    const report = vi.fn()
    const source = [
      '<template><div /></template>',
      '<style scoped>',
      '.demo { @apply flex; }',
      '</style>',
    ].join('\n')
    const listeners = lintRule.create({
      filename: '/tmp/demo.vue',
      options: [],
      report,
      sourceCode: {
        text: source,
      },
    })

    listeners.Program()

    expect(spy).toHaveBeenCalledWith(
      '\n.demo { @apply flex; }\n',
      '/tmp/demo.vue__style_0.css',
      undefined,
    )
    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith(expect.objectContaining({
      loc: {
        start: {
          line: 3,
          column: 4,
        },
        end: {
          line: 3,
          column: 10,
        },
      },
      message: '[style scoped] Unexpected Tailwind CSS @apply directive (tailwindcss/no-apply)',
    }))
  })

  it.each(['Custom issue', 'Custom issue (demo/rule)'])('formats the rule suffix once for "%s"', (message) => {
    vi.spyOn(core, 'runStylelintSync').mockReturnValue([
      {
        ruleId: 'demo/rule',
        message,
        line: 1,
        column: 1,
        severity: 2,
      },
    ])

    const report = vi.fn()
    const listeners = lintRule.create({
      filename: 'sample.vue',
      options: [],
      report,
      sourceCode: {
        text: '<style scoped>.demo {}</style>',
      },
    })

    listeners.Program()

    expect(report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      message: '[style scoped] Custom issue (demo/rule)',
    }))
  })

  it('extracts vue style blocks with source locations', () => {
    const source = [
      '<template />',
      '<style scoped>',
      '.demo {}',
      '</style>',
      '<style lang="scss">',
      '.foo { color: red; }',
      '</style>',
    ].join('\n')

    expect(__extractVueStyleBlocks(source, '/tmp/demo.vue')).toEqual([
      {
        attributes: {
          scoped: true,
        },
        code: '<style scoped>\n.demo {}\n</style>',
        content: '\n.demo {}\n',
        index: 0,
        label: 'style#1 scoped',
        startLine: 2,
        startColumn: 15,
        virtualFilename: '/tmp/demo.vue__style_0.css',
      },
      {
        attributes: {
          lang: 'scss',
        },
        code: '<style lang="scss">\n.foo { color: red; }\n</style>',
        content: '\n.foo { color: red; }\n',
        index: 1,
        label: 'style#2 lang=scss',
        startLine: 5,
        startColumn: 20,
        virtualFilename: '/tmp/demo.vue__style_1.scss',
      },
    ])
  })

  it('parses vue style attributes for context labels', () => {
    expect(__parseStyleAttributes('<style scoped module="$style" lang="scss">')).toEqual({
      scoped: true,
      module: '$style',
      lang: 'scss',
    })
  })

  it('normalizes vue style lang and builds virtual filenames', () => {
    expect(__normalizeStyleLang({})).toBe('css')
    expect(__normalizeStyleLang({ lang: 'SCSS' })).toBe('scss')
    expect(__createVueStyleVirtualFilename('/tmp/demo.vue', 1, { lang: 'scss' })).toBe(
      '/tmp/demo.vue__style_1.scss',
    )
  })

  it('maps block diagnostics back to the vue file', () => {
    expect(__mapDiagnosticToVueFile({
      ruleId: 'demo/rule',
      message: 'demo',
      line: 1,
      column: 8,
      endLine: 2,
      endColumn: 3,
    }, {
      code: '<style>\n.foo {}\n</style>',
      content: '\n.foo {}\n',
      attributes: {},
      index: 0,
      startLine: 10,
      startColumn: 10,
      virtualFilename: '/tmp/demo.vue__style_0.css',
    })).toEqual({
      ruleId: 'demo/rule',
      message: 'demo',
      line: 10,
      column: 17,
      endLine: 11,
      endColumn: 3,
    })
  })

  it('adds granular style block context for multiple vue style blocks', () => {
    const spy = vi.spyOn(core, 'runStylelintSync')
      .mockReturnValueOnce([
        {
          ruleId: 'demo/plain',
          message: 'Plain block issue',
          line: 2,
          column: 1,
          severity: 2,
        },
      ])
      .mockReturnValueOnce([
        {
          ruleId: 'demo/module',
          message: 'Module block issue',
          line: 2,
          column: 1,
          severity: 2,
        },
      ])

    const report = vi.fn()
    const listeners = lintRule.create({
      filename: '/tmp/demo.vue',
      options: [],
      report,
      sourceCode: {
        text: [
          '<style>',
          '.plain {}',
          '</style>',
          '<style module="$style" lang="scss">',
          '.module { color: red; }',
          '</style>',
        ].join('\n'),
      },
    })

    listeners.Program()

    expect(spy).toHaveBeenCalledTimes(2)
    expect(report).toHaveBeenNthCalledWith(1, expect.objectContaining({
      message: '[style#1] Plain block issue (demo/plain)',
    }))
    expect(report).toHaveBeenNthCalledWith(2, expect.objectContaining({
      message: '[style#2 module=$style lang=scss] Module block issue (demo/module)',
    }))
  })
})
