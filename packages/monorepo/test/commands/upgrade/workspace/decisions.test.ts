import { readFile } from 'node:fs/promises'
import { applyUpgradePlan, planUpgrade } from '@icebreakers/monorepo'
import path from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { snapshot } from '../plan/fixture'
import { decisionFrom, targets, withUpstream, workspaceFile, workspaceFixture } from './fixture'

afterEach(() => vi.useRealTimers())

describe('built upgrade field review decisions', () => {
  it('keeps an absent global override while applying other defaults, then remains stable across previews and applies', async () => {
    const h = await workspaceFixture()
    delete h.workspace.overrides.vite
    delete h.workspace.pmOnFail
    h.workspace.overrides['vite@>=8 <9'] = h.version
    await h.saveWorkspace()
    const first = await planUpgrade({ cwd: h.cwd, targets })
    await h.configure([decisionFrom(first)])
    const before = await snapshot(h.root)
    const reviewed = await planUpgrade({ cwd: h.cwd, targets })
    expect(await planUpgrade({ cwd: h.cwd, targets })).toEqual(reviewed)
    expect(await snapshot(h.root)).toEqual(before)
    expect(workspaceFile(reviewed).workspacePolicy!.findings[0]!.status).toBe('kept')
    expect(await applyUpgradePlan(h.cwd, reviewed)).toMatchObject({ status: 'applied' })
    const output = await readFile(path.join(h.cwd, targets[0]!), 'utf8')
    expect(output).not.toMatch(/^ {2}vite:/m)
    expect(output).toContain('pmOnFail: error')
    expect(await applyUpgradePlan(h.cwd, reviewed)).toMatchObject({ status: 'unchanged' })
    expect(workspaceFile(await planUpgrade({ cwd: h.cwd, targets })).status).toBe('identical')
  })

  it('invalidates changed upstream, local and configuration values rather than silently retaining them', async () => {
    const h = await workspaceFixture()
    delete h.workspace.overrides.vite
    await h.saveWorkspace()
    const first = await planUpgrade({ cwd: h.cwd, targets })
    const decision = decisionFrom(first)
    await h.configure([decision])
    const reviewed = await planUpgrade({ cwd: h.cwd, targets })
    const upstream = await withUpstream(h.cwd, { vite: '9.0.0' })
    expect(workspaceFile(upstream).workspacePolicy!.findings[0]!.status).toBe('stale-decision')
    expect(workspaceFile(upstream).status).toBe('conflict')
    h.workspace.overrides.vite = null
    await h.saveWorkspace()
    const local = await planUpgrade({ cwd: h.cwd, targets })
    expect(workspaceFile(local).workspacePolicy!.findings[0]).toMatchObject({ status: 'stale-decision', upstreamHash: decision.upstreamHash })
    expect(workspaceFile(local).workspacePolicy!.findings[0]!.localHash).not.toBe(decision.localHash)
    delete h.workspace.overrides.vite
    await h.saveWorkspace()
    await h.configure([{ ...decision, reason: 'Changed review rationale.' }])
    await expect(applyUpgradePlan(h.cwd, reviewed)).rejects.toThrow('Upgrade conflicts')
  })

  it('revalidates inclusive UTC expiry when previewing and applying saved plans', async () => {
    const h = await workspaceFixture()
    delete h.workspace.overrides.vite
    await h.saveWorkspace()
    const first = await planUpgrade({ cwd: h.cwd, targets })
    await h.configure([{ ...decisionFrom(first), expires: '2030-03-02' }])
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2030-03-02T23:59:59.000Z'))
    const reviewed = await planUpgrade({ cwd: h.cwd, targets })
    expect(workspaceFile(reviewed).workspacePolicy).toMatchObject({ expires: '2030-03-02', findings: [expect.objectContaining({ status: 'kept' })] })
    vi.setSystemTime(new Date('2030-03-03T00:00:00.000Z'))
    await expect(applyUpgradePlan(h.cwd, reviewed)).rejects.toThrow('decision expired')
    expect(workspaceFile(await planUpgrade({ cwd: h.cwd, targets })).workspacePolicy!.findings[0]!.status).toBe('expired-decision')
  })

  it('rejects duplicate decisions, ambiguous paths, invalid dates and missing fingerprints', async () => {
    const h = await workspaceFixture()
    delete h.workspace.overrides.vite
    await h.saveWorkspace()
    const decision = decisionFrom(await planUpgrade({ cwd: h.cwd, targets }))
    await h.configure([decision, decision])
    expect((await planUpgrade({ cwd: h.cwd, targets })).files[0]!.detail).toContain('Duplicate upgrade keep decision')
    for (const invalid of [{ ...decision, path: 'overrides.vite' }, { ...decision, expires: '2030-02-30' }, { ...decision, localHash: undefined }, { ...decision, file: 'package.json' }]) {
      await h.write('repoctl.config.mjs', `export default ${JSON.stringify({ commands: { upgrade: { keep: [invalid] } } })}`)
      expect((await planUpgrade({ cwd: h.cwd, targets })).status).toBe('blocked')
    }
  })

  it('does not let legacy migration bypass a dependency conflict', async () => {
    const h = await workspaceFixture()
    delete h.workspace.overrides.vite
    h.workspace.overrides['vite@>=8 <9'] = h.version
    await h.saveWorkspace()
    await h.write('.changeset/pre.json', '{"mode":"pre","tag":"beta"}')
    await h.write('.changeset/config.json', '{}')
    const plan = await planUpgrade({ cwd: h.cwd, targets })
    expect(workspaceFile(plan).status).toBe('conflict')
    expect(plan.status).toBe('blocked')
    await expect(applyUpgradePlan(h.cwd, plan)).rejects.toThrow('blocked upgrade plan')
    expect(await readFile(path.join(h.cwd, '.changeset/pre.json'), 'utf8')).toContain('beta')
  })
})
