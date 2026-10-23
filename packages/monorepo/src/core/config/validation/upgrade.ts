import type { UpgradeKeepDecision } from '../../../types/upgrade'
import type { Schema } from './schema'
import { array, choices, nonempty, object } from './schema'

export function isUpgradeExpiry(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}

const fingerprint: Schema = { expected: 'SHA-256 fingerprint from the upgrade preview', accepts: value => typeof value === 'string' && /^[\da-f]{64}$/.test(value) }
const keyPath: Schema = { expected: '["overrides", nonempty selector]', accepts: value => Array.isArray(value) && value.length === 2 && value[0] === 'overrides' && typeof value[1] === 'string' && value[1].trim().length > 0 }

export const upgradeKeepSchema = array(object({
  file: choices('pnpm-workspace.yaml'),
  path: keyPath,
  reason: nonempty,
  upstreamHash: fingerprint,
  localHash: fingerprint,
  expires: { expected: 'inclusive UTC YYYY-MM-DD date', accepts: isUpgradeExpiry },
} satisfies Record<keyof UpgradeKeepDecision, Schema>, ['file', 'path', 'reason', 'upstreamHash', 'localHash']))
