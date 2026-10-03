import type { UpgradePlan } from '../../types/upgrade'
import { Buffer } from 'node:buffer'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { packageDir } from '../../constants'
import { validateUpgradePlan } from '../upgrade/apply/validate'
import { ledgerPath, migrationGroup } from '../upgrade/migrations/record'
import { migrationRegistry } from '../upgrade/migrations/registry'
import { digest, maintenanceGit, maintenanceGitBytes } from './process'
/** Export the same built-in identities and path policy that produced the upgrade plan. */
export function getMaintenanceMigrationPolicy() {
  return {
    ledgerPath,
    group: migrationGroup,
    migrations: migrationRegistry.flatMap(migration => migration.maintenance ? [{ id: migration.id, version: migration.version, ...migration.maintenance }] : []),
  }
}
/** Validate metadata ownership before applying any maintenance files. */
export async function maintenanceMigrationPath(cwd: string, head: string, toolVersion: string, plan: UpgradePlan): Promise<string | null> {
  validateUpgradePlan(plan)
  const names = new Set(maintenanceGit(cwd, ['ls-tree', '-r', '--name-only', head]).trim().split('\n'))
  const { validateMaintenanceMigration } = await import(pathToFileURL(path.join(packageDir, 'resources/maintenance/migrations.mjs')).href)
  const { maintenanceTemplateVersion } = await import(pathToFileURL(path.join(packageDir, 'resources/maintenance/migration-lock.mjs')).href)
  const { validateMaintenanceLanes } = await import(pathToFileURL(path.join(packageDir, 'resources/maintenance/migration-lanes.mjs')).href)
  const fail = (message: string) => {
    throw new Error(`Maintenance migration blocked: ${message}`)
  }
  const read = (filename: string) => names.has(filename) ? maintenanceGitBytes(cwd, ['show', `${head}:${filename}`]) : null
  const result = validateMaintenanceMigration({
    plan,
    policy: getMaintenanceMigrationPolicy(),
    read,
    templateVersion: () => maintenanceTemplateVersion({ lock: maintenanceGitBytes(cwd, ['show', `${head}:pnpm-lock.yaml`]), toolVersion, fail }),
    validateLanes: (operation: unknown, tag: string) => validateMaintenanceLanes({ read, sourcePaths: names, operation, tag, Buffer, fail }),
    hash: digest,
    equal: isDeepStrictEqual,
    Buffer,
    fail,
  })
  return result?.path ?? null
}
