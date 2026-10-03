import type { InstallSecurityPresetPlan, InstallSecurityReport } from '@icebreakers/monorepo'
import { inspectInstallSecurity, planInstallSecurityPreset } from '@icebreakers/monorepo'
import { expectError, expectType } from 'tsd'

expectType<Promise<InstallSecurityReport>>(inspectInstallSecurity('.'))
expectType<Promise<InstallSecurityPresetPlan>>(planInstallSecurityPreset('.', { pnpmVersion: '12.8.1' }))
expectError(inspectInstallSecurity('.', { expectations: { trustPolicy: 'anything' } }))
expectError(inspectInstallSecurity('.', { expectations: { exceptions: [{ key: 'trustPolicyExclude', package: 'sdk' }] } }))
