import { describe, expect, it, vi } from 'vitest'
import { collectDoctorContext } from '@/commands/doctor/context'
import { collectSelectedDoctorChecks } from '@/commands/doctor/rules'
import { fixture } from './fixture'

const spies = vi.hoisted(() => ({ pnpm: vi.fn(), installation: vi.fn() }))
vi.mock('@/utils/pnpm-runtime', () => ({ inspectPnpmRuntime: spies.pnpm }))
vi.mock('@/commands/doctor/installation/state', () => ({ checkInstallation: spies.installation }))

describe('doctor check dispatch', () => {
  it('does not observe runtime for declaration-only checks or inspect installation for lockfile-only checks', async () => {
    const h = await fixture({ packageManager: 'pnpm@12.8.1' })
    const context = await collectDoctorContext(h.cwd)
    const checks = await collectSelectedDoctorChecks(context, new Set(['package-manager', 'lockfile-sync']))
    expect(checks.map(check => check.id)).toEqual(['package-manager', 'lockfile-sync'])
    expect(spies.pnpm).not.toHaveBeenCalled()
    expect(spies.installation).not.toHaveBeenCalled()
  })

  it('does not silently pass an aggregate health selection when manifests are invalid', async () => {
    const h = await fixture({ version: 'invalid' })
    const context = await collectDoctorContext(h.cwd)
    expect(await collectSelectedDoctorChecks(context, new Set(['manifest-health']))).toMatchObject([{ id: 'manifest-health', status: 'fail' }])
  })
})
