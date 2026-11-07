import type { Config } from 'stylelint'
import path from 'node:path'
import { icebreaker } from '@icebreakers/stylelint-config'
import stylelint from 'stylelint'

const codeFilename = path.join(import.meta.dirname, '../fixtures/stylelint-18.scss')

describe('Stylelint 18 published configuration', () => {
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
