import type { InstallSecurityExpectations } from '../../../commands/doctor/security/types'
import type { Schema } from './schema'
import { array, boolean, choices, nonempty, object } from './schema'

const releaseAge: Schema = {
  expected: 'nonnegative finite number',
  accepts: value => typeof value === 'number' && Number.isFinite(value) && value >= 0,
}

export const installationSecuritySchema = object({
  minimumReleaseAge: releaseAge,
  trustPolicy: choices('no-downgrade'),
  requireBuildApproval: boolean,
  severity: choices('warn', 'fail'),
  exceptions: array(object({
    key: choices('minimumReleaseAgeExclude', 'trustPolicyExclude'),
    package: nonempty,
    reason: nonempty,
  }, ['key', 'package', 'reason'])),
} satisfies Record<keyof InstallSecurityExpectations, Schema>)
