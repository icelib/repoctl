import type { Config } from 'stylelint'
import path from 'node:path'
import { icebreaker } from '@icebreakers/stylelint-config'
import stylelint from 'stylelint'

const codeFilename = path.join(import.meta.dirname, '../fixtures/stylelint-18.scss')

describe('Stylelint 18 published configuration', () => {
  it.each([
    ['variables.scss', '.page-shell { border: 2px solid $border-color; }'],
    ['gradient.scss', '.page-shell { background: linear-gradient(90deg, $first, $second); }'],
    ['namespace.scss', '.page-shell { background: linear-gradient(90deg, color.change($first, $alpha: 0.2), transparent); }'],
    ['function.scss', '.page-shell { background: tint-alpha($shade, 0.35); }'],
    ['component.vue', '<style lang="scss">.page-shell { border: 2px solid $border-color; }</style>'],
  ])('accepts composed Sass expressions in %s', async (filename, code) => {
    const result = await stylelint.lint({
      code,
      codeFilename: path.join(import.meta.dirname, '../fixtures', filename),
      config: icebreaker() as Config,
    })
    expect(result.errored).toBe(false)
    expect(result.results[0]?.warnings).toEqual([])
  })

  it('accepts SCSS directives and still rejects unknown directives through the SCSS rule', async () => {
    const config = icebreaker() as Config
    const valid = await stylelint.lint({ code: '@mixin good-name { color: red; }', codeFilename, config })
    expect(valid.errored).toBe(false)
    expect(valid.results[0]?.warnings).toEqual([])

    const invalid = await stylelint.lint({ code: '@not-a-real-rule {}', codeFilename, config })
    expect(invalid.errored).toBe(true)
    expect(invalid.results[0]?.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'scss/at-rule-no-unknown' }),
    ]))
  })
  it('loads the bundled SCSS preset without removed core rules', async () => {
    const result = await stylelint.lint({
      code: '.page-shell { color: red; }',
      codeFilename,
      config: icebreaker() as Config,
    })

    expect(result.errored).toBe(false)
    expect(result.results[0]?.warnings ?? []).toEqual([])
  })

  it('preserves the SCSS naming policy and its diagnostic message', async () => {
    const result = await stylelint.lint({
      code: '@mixin bad_name { color: red; }',
      codeFilename,
      config: icebreaker() as Config,
    })

    expect(result.errored).toBe(true)
    expect(result.results[0]?.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rule: 'scss/at-mixin-pattern',
        text: expect.stringContaining('Expected mixin name "bad_name" to be kebab-case'),
      }),
    ]))
  })
})
