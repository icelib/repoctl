import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { explainMonorepoConfig, init, loadMonorepoConfigDetails, sanitizeConfigReport, validateConfigFile, validateMonorepoConfig } from '@icebreakers/monorepo'
import { describe, expect, it } from 'vitest'
import { files, fixture, invoke } from './fixtures'

describe('built runtime config contracts', () => {
  it('supports no-config and reports a deterministic list of owned-field diagnostics', async () => {
    expect(await validateConfigFile(await fixture())).toEqual({ schemaVersion: 1, valid: true, file: null, diagnostics: [] })
    const report = validateMonorepoConfig({ commands: { cleen: {}, ai: { force: 'yes', format: 'xml' } }, tooling: { vitest: { coverageEnabled: 1 } } })
    expect(report.map(item => item.path)).toEqual(['commands.cleen', 'commands.ai.force', 'commands.ai.format', 'tooling.vitest.coverageEnabled'])
    expect(report[1]).toMatchObject({ id: 'config.invalid-type', actualType: 'string', expected: 'boolean' })
  })

  it.each(['ts', 'mjs', 'cjs'])('rejects invalid %s exports before init writes anything', async (extension) => {
    const declaration = extension === 'cjs' ? 'module.exports =' : 'export default'
    const cwd = await fixture(`${declaration} { commands: { init: { force: 'sensitive-value' } } }`, extension)
    const before = await files(cwd)
    await expect(init(cwd)).rejects.toMatchObject({ code: 'REPOCTL_CONFIG_INVALID' })
    expect(await files(cwd)).toEqual(before)
    const report = await validateConfigFile(cwd)
    expect(report).toMatchObject({ valid: false, diagnostics: [{ path: 'commands.init.force' }] })
    expect(JSON.stringify(report)).not.toContain('sensitive-value')
  })

  it('checks nulls and async factory exports before C12 default merging', async () => {
    for (const value of ['null', '[]', '42', '{ commands: { clean: { autoConfirm: null } } }']) {
      const cwd = await fixture(`export default async () => (${value})`)
      expect((await validateConfigFile(cwd)).valid).toBe(false)
    }
  })

  it('validates inherited config and active environment values', async () => {
    const cwd = await fixture(`export default { extends: './base.mjs', commands: { ai: { format: 'json' } } }`)
    await writeFile(path.join(cwd, 'base.mjs'), `export default { commands: { ai: { baseDir: 'team-prompts' } }, $meta: { name: 'team' } }`)
    expect(await explainMonorepoConfig(cwd, { command: 'ai' })).toMatchObject({ valid: true, effective: { values: { format: 'json', baseDir: 'team-prompts', force: false }, origins: { format: 'project', baseDir: 'project', force: 'default' } } })
    await writeFile(path.join(cwd, 'base.mjs'), `export default { commands: { ai: { forc: true } } }`)
    expect((await validateConfigFile(cwd)).diagnostics[0]?.path).toBe('commands.ai.forc')
    const active = await fixture(`export default { $test: { commands: { ai: { format: 'wrong' } } } }`)
    expect((await validateConfigFile(active)).valid).toBe(false)
  })

  it('preserves native tools, functions, regexes and custom template metadata', async () => {
    const cwd = await fixture(`const plugin = { customToken: 'sensitive-value' };
export default { tooling: { eslint: { extra: plugin }, lintStaged: { config: { '*.ts': () => 'tsc' } }, vitest: { overrides: { plugins: [plugin] } }, vitestProject: { alias: [{ find: /foo/, replacement: 'bar' }] } }, commands: { create: { templateMap: { custom: { source: 'src', target: 'apps/custom', label: 'Custom', category: 'app' } } } } }`)
    const loaded = await loadMonorepoConfigDetails(cwd)
    expect(typeof (loaded.config.tooling?.lintStaged?.config as Record<string, unknown>)?.['*.ts']).toBe('function')
    expect(loaded.config.tooling?.vitestProject?.alias?.[0]?.find).toBeInstanceOf(RegExp)
    const report = await explainMonorepoConfig(cwd)
    expect(report.valid).toBe(true)
    expect(JSON.stringify(report)).not.toContain('sensitive-value')
    expect(JSON.stringify(report)).toContain('[redacted]')
    const cycle: Record<string, unknown> = {}
    cycle['self'] = cycle
    expect(sanitizeConfigReport(cycle)).toEqual({ self: '[circular]' })
  })

  it('never serializes thrown configuration values or falls back to an empty valid report', async () => {
    const cwd = await fixture(`throw new Error('private-credential-value'); export default {}`)
    const report = await validateConfigFile(cwd)
    expect(report).toMatchObject({ valid: false, diagnostics: [{ id: 'config.load-failed' }] })
    const result = invoke(cwd, ['config', 'validate', '--json'])
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ valid: false })
    expect(result.stdout + result.stderr).not.toContain('private-credential-value')
  })

  it('blocks side effects in the real CLI even when an unrelated command field is invalid', async () => {
    const cwd = await fixture(`export default { commands: { clean: { autoConfrm: true } } }`)
    const before = await files(cwd)
    const result = invoke(cwd, ['ai', 'prompt', 'create', '--output', 'prompt.md'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('commands.clean.autoConfrm')
    expect(await files(cwd)).toEqual(before)
  })
})
