import type { DependencyAdmissionConfig, DependencyAdmissionException } from '@icebreakers/monorepo'
import { checkDependencyAdmission } from '@icebreakers/monorepo'
import { describe, expect, it } from 'vitest'
import { fixture, rule } from './fixture'

const now = new Date('2026-10-02T12:00:00Z')
const exception: DependencyAdmissionException = { rule: 'browser', workspace: 'packages/web', dependency: 'legacy-sdk', section: 'dependencies', reason: 'SDK migration tracked by the owning team' }

describe('admission exceptions and baseline reports', () => {
  it('waives only an exact declaration and exposes its reason', async () => {
    const h = await fixture({ 'packages/web': { dependencies: { 'legacy-sdk': '^1' }, peerDependencies: { 'legacy-sdk': '^1' } } })
    const result = await checkDependencyAdmission(h.workspace, { now, config: { rules: [rule({ sections: ['dependencies', 'peerDependencies'] })], exceptions: [exception] } })
    expect(result.summary).toEqual({ fail: 1, warn: 0, existing: 0, waived: 1 })
    expect(result.findings[0]?.declaration?.section).toBe('peerDependencies')
    expect(result.exceptions[0]?.reason).toBe(exception.reason)
  })

  it('warns seven days before expiry, remains valid through the UTC date and restores violations afterwards', async () => {
    const h = await fixture({ 'packages/web': { dependencies: { 'legacy-sdk': '^1' } } })
    const config = { rules: [rule()], exceptions: [{ ...exception, expiresOn: '2026-10-09' }] }
    const near = await checkDependencyAdmission(h.workspace, { config, now })
    expect(near.summary).toEqual({ fail: 0, warn: 1, existing: 0, waived: 1 })
    expect((await checkDependencyAdmission(h.workspace, { config, now: new Date('2026-10-09T23:59:59Z') })).summary.fail).toBe(0)
    const expired = await checkDependencyAdmission(h.workspace, { config, now: new Date('2026-10-10T00:00:00Z') })
    expect(expired.summary).toEqual({ fail: 1, warn: 1, existing: 0, waived: 0 })
    expect(expired.findings.map(item => item.id)).toEqual(['admission-expired-exception', 'admission-denied'])
  })

  it('supports an explicit allowlist waiver once and warns about stale exceptions', async () => {
    const h = await fixture({ 'packages/web': { dependencies: { 'legacy-sdk': '^1' } } })
    const config = { rules: [rule({ effect: 'allow', dependencies: ['react'] }), rule({ id: 'vue', effect: 'allow', dependencies: ['vue'] })], exceptions: [exception, { ...exception, dependency: 'absent' }] }
    const result = await checkDependencyAdmission(h.workspace, { config, now })
    expect(result.summary).toEqual({ fail: 0, warn: 1, existing: 0, waived: 1 })
    expect(result.findings[0]?.id).toBe('admission-unused-exception')
    config.exceptions[0] = { ...exception, expiresOn: '2026-01-01' }
    const expired = await checkDependencyAdmission(h.workspace, { config, now })
    expect(expired.findings.filter(item => item.id === 'admission-expired-exception')).toHaveLength(1)
    expect(expired.summary.fail).toBe(2)
  })

  it('does not use exceptions to choose a winner between contradictory rules', async () => {
    const h = await fixture({ 'packages/web': { dependencies: { 'legacy-sdk': '^1' } } })
    const result = await checkDependencyAdmission(h.workspace, { config: { rules: [rule(), rule({ id: 'allow', effect: 'allow' })], exceptions: [exception] } })
    expect(result.findings[0]?.id).toBe('admission-conflict')
    expect(result.summary.waived).toBe(0)
  })

  it('compares reviewed baselines while retaining visible existing and newly introduced findings', async () => {
    const h = await fixture({ 'packages/web': { dependencies: { 'legacy-sdk': '^1', 'other': '^1' } } })
    const config: DependencyAdmissionConfig = { rules: [rule({ dependencies: ['legacy-sdk', 'other'] })] }
    const baseline = await checkDependencyAdmission(h.workspace, { config })
    baseline.findings = baseline.findings.filter(item => item.declaration?.name === 'legacy-sdk')
    const result = await checkDependencyAdmission(h.workspace, { config, baseline })
    expect(result.mode).toBe('added')
    expect(result.summary).toEqual({ fail: 1, warn: 0, existing: 1, waived: 0 })
    expect(result.findings.find(item => item.declaration?.name === 'other')?.baseline).toBe('new')
    expect((await checkDependencyAdmission(h.workspace, { config, baseline, full: true })).summary.fail).toBe(2)
    await expect(checkDependencyAdmission(h.workspace, { config: { rules: [rule()] }, baseline })).rejects.toThrow('different policy')
    await expect(checkDependencyAdmission(h.workspace, { config, baseline: null })).rejects.toThrow('baseline is invalid')
    baseline.findings[0]!.key = 'forged'
    await expect(checkDependencyAdmission(h.workspace, { config, baseline })).rejects.toThrow('inconsistent')
  })
})
