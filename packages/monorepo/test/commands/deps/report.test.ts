import { applyDependencyFixPlan, checkDependencies, planDependencyFix } from '@icebreakers/monorepo'
import { describe, expect, it } from 'vitest'
import { fixture, policy, runCli, snapshot } from './fixture'

describe('built dependency consistency API and CLI', () => {
  it('distinguishes identical, equivalent, compatible, mutually exclusive and unknown ranges', async () => {
    const h = await fixture({
      'packages/a': { dependencies: { same: '^1.0.0', equivalent: '^1.0.0', compatible: '^1.0.0', conflict: '^1.0.0', unknown: 'latest', odd: '1 || 2' } },
      'packages/b': { dependencies: { same: '^1.0.0', equivalent: '>=1.0.0 <2.0.0-0', compatible: '~1.2.0', conflict: '^2.0.0', unknown: 'latest', odd: '2 || 3' } },
      'packages/c': { dependencies: { odd: '1 || 3' } },
    })
    const before = await snapshot(h.root)
    const report = await checkDependencies(h.workspace)
    expect(Object.fromEntries(report.groups.map(group => [group.dependency, group.status]))).toEqual({ same: 'consistent', equivalent: 'equivalent', compatible: 'compatible', conflict: 'conflict', unknown: 'uncomparable', odd: 'conflict' })
    expect(report.groups.find(group => group.dependency === 'compatible')?.occurrences).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'packages/a/package.json', section: 'dependencies', specifier: '^1.0.0' })]))
    const first = runCli(h, ['check', '--json'])
    expect(first.status).toBe(1)
    expect(JSON.parse(first.stdout)).toEqual(report)
    expect(runCli(h, ['check', '--json']).stdout).toBe(first.stdout)
    const chinese = JSON.parse(runCli(h, ['check', '--json'], h.workspace, 'zh-CN').stdout)
    expect(chinese.groups.map(({ dependency, section, status }: { dependency: string, section: string, status: string }) => ({ dependency, section, status }))).toEqual(report.groups.map(({ dependency, section, status }) => ({ dependency, section, status })))
    expect(await snapshot(h.root)).toEqual(before)
  })

  it('respects prerelease exclusions and prerelease versions explicitly admitted by every range', async () => {
    const h = await fixture({
      'packages/a': { dependencies: { excluded: '>=1.0.0-beta.1 <1.0.0', admitted: '>=1.0.0-beta.1 <1.0.0', stable: '^1.0.0-beta.1' } },
      'packages/b': { dependencies: { excluded: '*', admitted: '>=1.0.0-beta.2 <1.0.0', stable: '^1.0.0' } },
    })
    const report = await checkDependencies(h.workspace)
    expect(Object.fromEntries(report.groups.map(group => [group.dependency, group.status]))).toEqual({ excluded: 'conflict', admitted: 'compatible', stable: 'compatible' })
  })

  it('keeps dependency sections, deliberate version cohorts and reasoned exceptions separate', async () => {
    const h = await fixture({
      'packages/a': { dependencies: { vue: '^3.0.0' }, devDependencies: { vue: '3.5.0' }, peerDependencies: { vue: '^2 || ^3' }, optionalDependencies: { vue: '^1.0.0' } },
      'packages/legacy': { dependencies: { vue: '^2.0.0' } },
      'packages/experiment': { dependencies: { vue: 'next' } },
    })
    await policy(h.workspace, [
      { name: 'legacy', workspaces: ['packages/legacy'], dependencies: ['vue'], reason: 'Vue 2 adapter support' },
      { name: 'canary', workspaces: ['packages/experiment'], dependencies: ['vue'], reason: 'Upstream compatibility experiments', ignore: true },
    ])
    const report = await checkDependencies(h.workspace)
    expect(report.groups).toHaveLength(6)
    expect(report.summary.conflict).toBe(0)
    expect(report.groups.find(group => group.group === 'legacy')).toMatchObject({ reason: 'Vue 2 adapter support', status: 'consistent' })
    expect(report.groups.find(group => group.group === 'canary')).toMatchObject({ reason: 'Upstream compatibility experiments', status: 'exception' })
    await expect(planDependencyFix(h.workspace, { dependency: 'vue', section: 'dependencies', group: 'canary', to: '^3.0.0' })).rejects.toThrow('exception')
  })

  it('reports alias sources, catalogs and workspace protocols without collapsing their semantics', async () => {
    const h = await fixture({
      'packages/a': { dependencies: { alias: 'npm:@scope/actual@^1.0.0', different: 'npm:first@^1', catalog: 'catalog:', named: 'catalog:legacy', local: 'workspace:*', linked: 'file:../local' } },
      'packages/b': { dependencies: { alias: 'npm:@scope/actual@~1.2.0', different: 'npm:second@^1', catalog: '^1.0.0', named: '^2.0.0', local: 'workspace:^', linked: 'https://example.invalid/package.tgz' } },
    })
    const { writeFile } = await import('node:fs/promises')
    await writeFile(`${h.workspace}/pnpm-workspace.yaml`, 'packages: [packages/*]\ncatalog:\n  catalog: ^1.0.0\ncatalogs:\n  legacy:\n    named: ^2.0.0\n')
    const report = await checkDependencies(h.workspace)
    expect(report.groups.find(group => group.dependency === 'alias')).toMatchObject({ status: 'compatible', occurrences: [expect.objectContaining({ source: '@scope/actual', protocol: 'npm' }), expect.any(Object)] })
    expect(report.groups.find(group => group.dependency === 'different')?.status).toBe('uncomparable')
    expect(report.groups.find(group => group.dependency === 'catalog')?.status).toBe('equivalent')
    expect(report.groups.find(group => group.dependency === 'named')?.status).toBe('equivalent')
    expect(report.groups.find(group => group.dependency === 'local')?.status).toBe('managed')
    expect(report.groups.find(group => group.dependency === 'linked')?.status).toBe('uncomparable')
    const alias = await planDependencyFix(h.workspace, { dependency: 'alias', section: 'dependencies', to: 'npm:@scope/actual@^1.2.0' })
    expect(alias.files.every(file => file.after.startsWith('npm:@scope/actual@'))).toBe(true)
    await expect(planDependencyFix(h.workspace, { dependency: 'catalog', section: 'dependencies', to: '^1.0.0' })).rejects.toThrow('report-only')
    await expect(planDependencyFix(h.workspace, { dependency: 'alias', section: 'dependencies', to: 'npm:other@^1.2.0' })).rejects.toThrow('same source')
    await applyDependencyFixPlan(h.workspace, alias)
    expect((await checkDependencies(h.workspace)).groups.find(group => group.dependency === 'alias')).toMatchObject({ status: 'consistent', occurrences: [expect.objectContaining({ specifier: 'npm:@scope/actual@^1.2.0' }), expect.objectContaining({ specifier: 'npm:@scope/actual@^1.2.0' })] })
  })

  it('rejects ambiguous or undocumented policy exceptions', async () => {
    const h = await fixture({ 'packages/a': { dependencies: { dep: '^1' } } })
    await policy(h.workspace, [{ name: 'invalid', workspaces: ['packages/a'], dependencies: ['dep'], ignore: true, reason: '' }])
    expect(runCli(h, ['check', '--json']).status).not.toBe(0)
    await policy(h.workspace, [
      { name: 'one', workspaces: ['packages/a'], dependencies: ['dep'], reason: 'First rule' },
      { name: 'two', workspaces: ['packages/a'], dependencies: ['dep'], reason: 'Second rule' },
    ])
    const result = runCli(h, ['check', '--json'])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Overlapping dependency groups')
  })

  it.each(['en', 'zh-CN'])('exposes the read-only plan and explicit apply workflow in %s help', async (lang) => {
    const h = await fixture()
    const help = runCli(h, ['plan', '--help'], h.workspace, lang)
    expect(help.status).toBe(0)
    expect(help.stdout).toContain('--section')
    expect(help.stdout).toContain('--to')
    expect(help.stdout).toContain(lang === 'en' ? 'read-only' : '只读')
  })
})
