import type { UpgradeApplyOptions, UpgradeApplyResult, UpgradePlan } from '../../../types/upgrade'
import type { OwnedDirectory } from './transaction/state'
import path from 'pathe'
import { assetsDir } from '../../../constants'
import { withOperationLock } from '../../../core/operation-lock'
import { clearWorkspaceCache } from '../../../core/workspace'
import { findWorkspacePackages } from '../../../core/workspace/discovery'
import { upgradeOperations } from '../baseline/apply'
import { applyMigrationFiles } from '../migrations/apply'
import { ledgerPath, migrationGroup } from '../migrations/record'
import { canonicalDirectory, hash, readOptional } from '../plan/files'
import { writeUpgradeTransaction } from './transaction'
import { cleanDirectories, ensureParent } from './transaction/state'
import { actionable, validateUpgradePlan } from './validate'

/** Apply reviewed bytes only after all plan preconditions have been checked. */
async function applyLocked(cwd: string, plan: UpgradePlan, options: UpgradeApplyOptions): Promise<UpgradeApplyResult> {
  validateUpgradePlan(plan)
  if (await canonicalDirectory(path.resolve(cwd)) !== plan.cwd || await canonicalDirectory(plan.rootDir) !== plan.rootDir
    || await canonicalDirectory(assetsDir) !== plan.assetDir) {
    throw new Error('Upgrade plan belongs to another directory or asset installation.')
  }
  const selected = new Set(options.files ?? plan.files.filter(actionable).map(file => file.path))
  if ([...selected].some(filename => !plan.files.some(file => file.path === filename && actionable(file)))) {
    throw new Error('Selection contains an unplanned upgrade path.')
  }
  for (const file of plan.files.filter(actionable)) {
    if (file.group && selected.has(file.path) && plan.files.some(other => other.group === file.group && actionable(other) && !selected.has(other.path))) {
      throw new Error(`Apply every file in migration group ${file.group} together.`)
    }
  }
  const conflicts: string[] = []
  const unresolved = plan.files.filter(file => file.status === 'conflict').map(file => file.path)
  const report = unresolved.length ? { conflicts: unresolved } : {}
  const files = upgradeOperations(plan.files.filter(file => selected.has(file.path)))
  let pending = 0
  let applied = 0
  for (const input of plan.inputs) {
    const root = input.area === 'target' ? plan.rootDir : input.area === 'asset' ? plan.assetDir : path.dirname(input.path)
    const current = await readOptional(root, input.area === 'config' ? path.basename(input.path) : input.path)
    const currentHash = current === null ? null : hash(current)
    const relative = input.area === 'config' ? path.relative(plan.rootDir, input.path) : input.path
    const file = input.area !== 'asset' ? files.find(item => item.path === relative) : undefined
    if (currentHash === input.hash) {
      if (file && input.area === 'target') {
        pending++
      }
    }
    else if (file && currentHash === file.afterHash) {
      if (input.area === 'target') {
        applied++
      }
    }
    else {
      conflicts.push(`${input.area}:${input.path}`)
    }
  }
  if (plan.discovery) {
    const packages = await findWorkspacePackages(plan.rootDir, plan.discovery.patterns ? { patterns: plan.discovery.patterns } : {})
    const manifests = packages.map(pkg => path.relative(plan.rootDir, path.join(path.resolve(pkg.rootDir), 'package.json'))).sort()
    if (JSON.stringify(manifests) !== JSON.stringify(plan.discovery.manifests)) {
      conflicts.push('workspace package set')
    }
  }
  if (conflicts.length) {
    throw new Error(`Upgrade conflicts; regenerate the plan: ${conflicts.join(', ')}`)
  }
  if (pending && applied) {
    throw new Error('Upgrade plan is partially applied; restore retained backups or review a new plan.')
  }
  if (!pending) {
    return { status: 'unchanged', changed: [], ...report }
  }
  try {
    if (plan.migrations?.ledger && selected.has(ledgerPath)) {
      await applyMigrationFiles(plan, files.filter(file => file.group === migrationGroup))
      try {
        await writeUpgradeTransaction(plan.rootDir, files.filter(file => file.group !== migrationGroup))
      }
      catch (error) {
        throw new Error(`Migrations completed, but remaining selected assets failed. Preserve local edits and regenerate the upgrade plan to continue: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
      }
    }
    else {
      await writeUpgradeTransaction(plan.rootDir, files)
    }
  }
  finally {
    clearWorkspaceCache()
  }
  return { status: 'applied', changed: files.map(file => file.path), ...report }
}

/** Hold the same lock through preconditions, no-op detection, writes and recovery. */
export async function applyUpgradePlan(cwd: string, plan: UpgradePlan, options: UpgradeApplyOptions = {}): Promise<UpgradeApplyResult> {
  validateUpgradePlan(plan)
  if (await canonicalDirectory(path.resolve(cwd)) !== plan.cwd || await canonicalDirectory(plan.rootDir) !== plan.rootDir || await canonicalDirectory(assetsDir) !== plan.assetDir) {
    throw new Error('Upgrade plan belongs to another directory or asset installation.')
  }
  const directories: OwnedDirectory[] = []
  try {
    await ensureParent(plan.rootDir, directories)
    return await withOperationLock(plan.rootDir, 'upgrade', () => applyLocked(cwd, plan, options))
  }
  finally {
    await cleanDirectories(directories)
  }
}
