import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { explainMonorepoConfig, init, planUpgrade, resolveCommandConfig, resolveCommandValues } from '@icebreakers/monorepo'
import { describe, expect, it } from 'vitest'
import { fixture, invoke } from './fixtures'

describe('built effective config explanation', () => {
  it('shares ai defaults, project values and CLI overrides with actual generation', async () => {
    const cwd = await fixture(`export default { commands: { ai: { baseDir: 'team', format: 'json', force: true } } }`)
    const preview = invoke(cwd, ['config', 'inspect', '--command', 'ai', '--set', 'baseDir="reviewed"', '--set', 'force=false', '--json'])
    expect(preview.status).toBe(0)
    const report = JSON.parse(preview.stdout)
    expect(report.effective).toMatchObject({ values: { baseDir: 'reviewed', format: 'json', force: false }, origins: { baseDir: 'cli', format: 'project', force: 'cli' } })
    expect(invoke(cwd, ['ai', 'prompt', 'create', '--dir', 'reviewed', '--name', 'task']).status).toBe(0)
    expect(JSON.parse(await readFile(path.join(cwd, 'reviewed/task.json'), 'utf8'))).toHaveProperty('Goal and deliverables')
    expect((await explainMonorepoConfig(cwd, { command: 'clean' })).effective).toMatchObject({ values: { includePrivate: true, autoConfirm: false }, origins: { includePrivate: 'default' } })
  })

  it('preserves explicit false and replaces arrays without mutating caller values', () => {
    const project = { qualityScripts: ['test'], hooks: { beforeVersion: ['prepare'] } }
    const effective = resolveCommandValues('release', project, { qualityScripts: [] })
    expect(effective.values).toMatchObject({ qualityScripts: [], hooks: { beforeVersion: ['prepare'], verify: [] } })
    expect(effective.origins).toMatchObject({ 'qualityScripts': 'cli', 'hooks.beforeVersion': 'project', 'hooks.verify': 'default' })
    expect(project).toEqual({ qualityScripts: ['test'], hooks: { beforeVersion: ['prepare'] } })
    expect(resolveCommandValues('clean', { includePrivate: true }, { includePrivate: false }).values.includePrivate).toBe(false)
    expect(() => resolveCommandValues('upgrade', { overwrite: true }, { noOverwrite: true })).toThrow('config.conflict')
  })

  it('explains the root policy that workspace commands execute from a child directory', async () => {
    const cwd = await fixture(`export default { commands: { clean: { includePrivate: false } } }`)
    await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), 'packages: []\n')
    const child = path.join(cwd, 'packages/lib')
    await mkdir(child, { recursive: true })
    const project = await resolveCommandConfig('clean', child)
    const report = await explainMonorepoConfig(child, { command: 'clean' })
    expect(report.effective?.values).toEqual(resolveCommandValues('clean', project).values)
    expect(report.effective?.origins['includePrivate']).toBe('project')
  })

  it('redacts all env values and native payloads in existing JSON output and contextual reports', async () => {
    const cwd = await fixture(`export default { commands: { mirror: { env: { ANY_NAME: 'private-credential-value' } } }, tooling: { eslint: { settings: { arbitrary: 'private-credential-value' } } }, $test: { tooling: { stylelint: { custom: 'private-credential-value' } } } }`)
    for (const args of [[], ['--command', 'mirror']]) {
      const result = invoke(cwd, ['config', 'inspect', '--json', ...args])
      expect(result.status).toBe(0)
      expect(result.stdout + result.stderr).not.toContain('private-credential-value')
      expect(result.stdout).toContain('[redacted]')
    }
  })

  it('rejects unknown contexts, unknown override fields and malformed overrides without leaking values', async () => {
    const cwd = await fixture()
    for (const args of [['--command', 'unknown'], ['--command', 'constructor'], ['--command', 'clean', '--set', 'autoConfrm="sensitive-value"'], ['--set', 'force=true'], ['--command', 'ai', '--set', '__proto__.secret="sensitive-value"'], ['--command', 'ai', '--set', 'force=sensitive-value']]) {
      const result = invoke(cwd, ['config', 'inspect', '--json', ...args])
      expect(result.status).toBe(1)
      expect(JSON.parse(result.stdout)).toMatchObject({ valid: false, schemaVersion: 1 })
      expect(result.stdout + result.stderr).not.toContain('sensitive-value')
    }
  })
})

describe('effective config execution regressions', () => {
  it('clears replaced origin shapes and keeps dotted template keys unambiguous', async () => {
    const object = { source: 'next', target: 'apps/next' }
    const forward = resolveCommandValues('create', { templateMap: { 'team.app': 'old' } }, { templateMap: { 'team.app': object } })
    expect(forward.origins).toMatchObject({ 'templateMap.team\\.app.source': 'cli', 'templateMap.team\\.app.target': 'cli' })
    expect(forward.origins).not.toHaveProperty('templateMap.team\\.app')
    const reverse = resolveCommandValues('create', { templateMap: { custom: object } }, { templateMap: { custom: 'new' } })
    expect(Object.keys(reverse.origins).filter(key => key.startsWith('templateMap.'))).toEqual(['templateMap.custom'])
    const cwd = await fixture(`export default { commands: { create: { templateMap: { 'team.app': 'custom-source' } } } }`)
    const text = invoke(cwd, ['config', 'inspect', '--command', 'create'])
    expect(text.status, text.stderr).toBe(0)
    expect(text.stdout).toContain('"custom-source" (project)')
  })

  it('uses the project init preset and explains the top-level CLI default without changing the API default', async () => {
    const cwd = await fixture(`export default { commands: { init: { preset: 'minimal' } } }`)
    expect((await explainMonorepoConfig(cwd, { command: 'init' })).effective).toMatchObject({ values: { preset: 'minimal' }, origins: { preset: 'project' } })
    const result = invoke(cwd, ['init', '--yes'])
    expect(result.status, result.stderr).toBe(0)
    await expect(readFile(path.join(cwd, 'tsconfig.json'), 'utf8')).resolves.toContain('compilerOptions')
    await expect(readFile(path.join(cwd, 'eslint.config.js'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    const empty = await fixture()
    expect((await explainMonorepoConfig(empty, { command: 'init' })).effective).toMatchObject({ values: { preset: 'standard' }, origins: { preset: 'default' } })
    expect(resolveCommandValues('init').values.preset).toBeUndefined()
    await init(empty)
    await expect(readFile(path.join(empty, 'tsconfig.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('uses the resolved upgrade merge policy and preserves explicit target replacement', async () => {
    const cwd = await fixture(`export default { commands: { upgrade: { targets: ['README.md'], mergeTargets: true } } }`)
    expect((await planUpgrade({ cwd, mergeTargets: false })).targets).toEqual(['README.md'])
    expect((await planUpgrade({ cwd })).targets.length).toBeGreaterThan(1)
    expect((await planUpgrade({ cwd, targets: ['AGENTS.md'] })).targets).toEqual(['AGENTS.md'])
  })
})
