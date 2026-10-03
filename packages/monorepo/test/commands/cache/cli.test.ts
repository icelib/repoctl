import { readdir, readFile } from 'node:fs/promises'
import { analyzeTurboRuns } from '@icebreakers/monorepo'
import { describe, expect, it } from 'vitest'
import { cli, fixture } from './fixture'

describe('built check cache CLI', () => {
  it('accepts flags before and after the subcommand, matches API output and preserves all files', async () => {
    const { data, save, root } = await fixture()
    const file = await save('summary.json', data)
    const before = await readFile(file)
    const expected = await analyzeTurboRuns(file, { slowest: 1 })
    for (const args of [['cache', file, '--json', '--slowest', '1'], ['--json', 'cache', file, '--slowest', '1'], ['--dry-run', 'cache', file, '--json', '--slowest', '1']]) {
      expect(JSON.parse(cli(root, args))).toEqual(expected)
    }
    expect(cli(root, ['cache', file, '--markdown'])).toContain('# Turbo cache analysis')
    expect(await readdir(root)).toEqual(['summary.json'])
    expect(await readFile(file)).toEqual(before)
  })

  it('rejects execution options and invalid limits rather than silently running or ignoring them', async () => {
    const { data, save, root } = await fixture()
    const file = await save('summary.json', data)
    for (const flags of [['--full'], ['--affected'], ['--out', 'report.json'], ['--report', 'report.json'], ['--json', '--markdown'], ['--slowest', '0'], ['--slowest', '101'], ['--slowest', '1.5']]) {
      expect(() => cli(root, ['cache', file, ...flags])).toThrow()
    }
    expect(await readdir(root)).toEqual(['summary.json'])
  })
})
