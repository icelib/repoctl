import { readFile } from 'node:fs/promises'
import { applyUpgradePlan, formatUpgradePlan, planUpgrade } from '@icebreakers/monorepo'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { cli, snapshot } from '../plan/fixture'
import { targets, withUpstream, workspaceFile, workspaceFixture } from './fixture'

describe('built upgrade override policy', () => {
  it('protects Vite 4/5/8 cohorts, including ignored groups, and never applies a conflicting file', async () => {
    const h = await workspaceFixture()
    delete h.workspace.overrides.vite
    h.workspace.overrides['vite@>=8 <9'] = h.version
    await h.saveWorkspace()
    await h.write('packages/taro/package.json', '{"name":"taro","devDependencies":{"vite":"^4.5.0"}}')
    await h.write('packages/uni/package.json', '{"name":"uni","devDependencies":{"vite":"5.2.8"}}')
    await h.write('packages/a/package.json', '{"name":"a","devDependencies":{"vite":"^8.0.0"}}')
    const before = await snapshot(h.root)
    const plan = await planUpgrade({ cwd: h.cwd, targets, overwrite: true, yes: true })
    const file = workspaceFile(plan)
    expect(file).toMatchObject({ status: 'conflict', reason: 'workspace-override-policy', content: null })
    expect(file.baseline).toBeUndefined()
    expect(file.workspacePolicy!.findings[0]!.affected).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'packages/taro/package.json', group: 'taro' }),
      expect.objectContaining({ path: 'packages/uni/package.json', group: 'uni' }),
      expect.objectContaining({ path: 'packages/a/package.json', group: 'default' }),
    ]))
    expect(formatUpgradePlan(plan)).toContain('Taro requires Vite 4.')
    expect(cli(h.cwd, ['--json']).status).toBe(1)
    expect(await applyUpgradePlan(h.cwd, plan)).toMatchObject({ status: 'unchanged', conflicts: targets })
    expect(await snapshot(h.root)).toEqual(before)
  })

  it('still applies compatible global overrides and checks manifest/discovery drift', async () => {
    const h = await workspaceFixture()
    delete h.workspace.overrides.vite
    await h.saveWorkspace()
    await h.write('packages/a/package.json', '{"name":"a","devDependencies":{"vite":"^8.0.0"}}')
    const plan = await planUpgrade({ cwd: h.cwd, targets })
    expect(workspaceFile(plan).workspacePolicy!.findings[0]!.status).toBe('compatible')
    await h.write('packages/a/package.json', '{"name":"a","devDependencies":{"vite":"^4.0.0"}}')
    await expect(applyUpgradePlan(h.cwd, plan)).rejects.toThrow('Upgrade conflicts')
    await h.write('packages/a/package.json', '{"name":"a","devDependencies":{"vite":"^8.0.0"}}')
    await h.write('packages/added/package.json', '{"name":"added"}')
    await expect(applyUpgradePlan(h.cwd, plan)).rejects.toThrow('workspace package set')
    const refreshed = await planUpgrade({ cwd: h.cwd, targets })
    expect(await applyUpgradePlan(h.cwd, refreshed)).toMatchObject({ status: 'applied' })
    expect(await applyUpgradePlan(h.cwd, refreshed)).toMatchObject({ status: 'unchanged' })
  })

  it('allows disjoint constrained overrides and does not confuse vite-plugin with vite', async () => {
    const h = await workspaceFixture()
    delete h.workspace.overrides.vite
    h.workspace.overrides['vite@<6'] = '5.2.8'
    h.workspace.overrides['host>vite-plugin'] = '1.0.0'
    await h.saveWorkspace()
    const disjoint = await withUpstream(h.cwd, { 'vite@>=8 <9': h.version })
    expect(workspaceFile(disjoint).workspacePolicy!.findings[0]!.status).toBe('compatible')
    delete h.workspace.overrides['vite@<6']
    await h.saveWorkspace()
    const global = await withUpstream(h.cwd, { vite: h.version })
    expect(workspaceFile(global).workspacePolicy!.findings[0]!.status).toBe('compatible')
    h.workspace.overrides['host@>1>vite@^4'] = '4.5.0'
    await h.saveWorkspace()
    expect(workspaceFile(await withUpstream(h.cwd, { 'vite@>=8 <9': h.version })).status).not.toBe('conflict')
    expect(workspaceFile(await withUpstream(h.cwd, { vite: h.version })).status).toBe('conflict')
  })

  it('resolves catalog and npm-alias declarations without guessing unknown protocols', async () => {
    const h = await workspaceFixture()
    delete h.workspace.overrides.vite
    h.workspace.catalog = { vite: '^4.0.0' }
    await h.saveWorkspace()
    await h.write('packages/a/package.json', '{"name":"a","dependencies":{"vite":"catalog:","other-vite":"npm:vite@^5.0.0"}}')
    const file = workspaceFile(await planUpgrade({ cwd: h.cwd, targets }))
    expect(file.status).toBe('conflict')
    expect(file.workspacePolicy!.findings[0]!.affected).toEqual(expect.arrayContaining([
      expect.objectContaining({ specifier: 'catalog:' }),
      expect.objectContaining({ specifier: 'npm:vite@^5.0.0' }),
    ]))
  })

  it('inspects workspaces newly included by the proposed package patterns', async () => {
    const h = await workspaceFixture()
    h.workspace.packages = ['packages/*']
    delete h.workspace.overrides.vite
    await h.saveWorkspace()
    await h.write('apps/legacy/package.json', '{"name":"legacy","dependencies":{"vite":"^4.0.0"}}')
    const plan = await planUpgrade({ cwd: h.cwd, targets })
    expect(workspaceFile(plan).status).toBe('conflict')
    expect(workspaceFile(plan).workspacePolicy!.findings[0]!.affected).toContainEqual(expect.objectContaining({ path: 'apps/legacy/package.json' }))
    await h.write('apps/legacy/package.json', '{"name":"legacy","dependencies":{"vite":"^8.0.0"}}')
    const compatible = await planUpgrade({ cwd: h.cwd, targets })
    await h.write('apps/added/package.json', '{"name":"added"}')
    await expect(applyUpgradePlan(h.cwd, compatible)).rejects.toThrow('workspace package set')
  })

  it('requires explicit review for new nested overrides, even with --yes', async () => {
    const h = await workspaceFixture()
    delete h.workspace.overrides['@arethetypeswrong/core>typescript']
    await h.saveWorkspace()
    const before = await readFile(path.join(h.cwd, targets[0]!), 'utf8')
    const plan = await planUpgrade({ cwd: h.cwd, targets, yes: true, overwrite: true })
    expect(workspaceFile(plan)).toMatchObject({ status: 'modify', automatic: false })
    expect(workspaceFile(plan).workspacePolicy!.findings[0]!.status).toBe('unverified')
    expect(cli(h.cwd, ['--yes']).status).toBe(0)
    expect(await readFile(path.join(h.cwd, targets[0]!), 'utf8')).toBe(before)
    await applyUpgradePlan(h.cwd, plan)
    expect(workspaceFile(await planUpgrade({ cwd: h.cwd, targets })).workspacePolicy).toBeUndefined()
  })

  it('tracks imported configuration JSON separately from workspace membership', async () => {
    const h = await workspaceFixture()
    delete h.workspace.overrides.vite
    await h.saveWorkspace()
    await h.write('config/package.json', '{"custom":true}')
    await h.write('repoctl.config.mjs', 'import config from "./config/package.json" with {type:"json"}; export default {commands:{upgrade:{targets:["pnpm-workspace.yaml"],mergeTargets:!config.custom}}}')
    const plan = await planUpgrade({ cwd: h.cwd, targets })
    expect(plan.status, JSON.stringify(plan.blockers)).toBe('ready')
    expect(plan.discovery!.manifests).not.toContain('config/package.json')
    expect(plan.inputs.some(input => input.path.endsWith('config/package.json'))).toBe(true)
    expect(await applyUpgradePlan(h.cwd, plan)).toMatchObject({ status: 'applied' })
  })
})
