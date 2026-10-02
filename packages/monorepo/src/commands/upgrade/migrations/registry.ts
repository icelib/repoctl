import type { UpgradeContext } from '../plan/context'
import { compare, gt, lte } from 'semver'
import { legacyVersioningMigration } from './legacy'

export interface MigrationDefinition {
  id: string
  version: string
  adoptUnknown: boolean
  detect: (context: UpgradeContext) => Promise<boolean>
  check?: (context: UpgradeContext) => Promise<{ id: string, path: string, retain: string[], reason: string, detail: string } | null>
  plan: (context: UpgradeContext) => Promise<string[]>
}

export const migrationRegistry: readonly MigrationDefinition[] = [legacyVersioningMigration]

/** Only exact source versions prove a crossing; unknown sources require detection. */
export function selectMigrations(registry: readonly MigrationDefinition[], from: string | null, to: string) {
  return [...registry].filter(item => lte(item.version, to) && (from === null || gt(item.version, from))).sort((a, b) => compare(a.version, b.version) || a.id.localeCompare(b.id))
}
