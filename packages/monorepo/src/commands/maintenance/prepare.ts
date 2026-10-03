import type { MaintenanceUpgradeOptions, MaintenanceUpgradeReport } from './types'
import { mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { applyUpgradePlan, planUpgrade } from '../upgrade'
import { isRootAsset } from '../upgrade/baseline/record'
import { createMaintenancePatch, maintenanceBody } from './artifacts'
import { maintenanceMigrationPath } from './migrations'
import { maintenanceCommand, maintenanceGit } from './process'
import { detectMaintenanceVersionChange } from './versions'

async function runCheck(options: MaintenanceUpgradeOptions, report: MaintenanceUpgradeReport, name: string, args: string[]) {
  const result = maintenanceCommand(options, args)
  const log = `check-${report.checks.length}.log`
  await writeFile(path.join(options.outputDirectory, log), result.output)
  report.checks.push({ name, args, status: result.passed ? 'passed' : 'failed', log })
  if (!result.passed) {
    throw new Error(`Maintenance validation failed: ${name}; see ${log}.`)
  }
}

async function generate(options: MaintenanceUpgradeOptions, report: MaintenanceUpgradeReport) {
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(options.base) || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(report.head)) {
    throw new Error('Maintenance comparison requires full lowercase commit SHAs.')
  }
  if (maintenanceGit(options.cwd, ['rev-parse', 'HEAD']).trim() !== report.head
    || await realpath(maintenanceGit(options.cwd, ['rev-parse', '--show-toplevel']).trim()) !== options.cwd
    || maintenanceGit(options.cwd, ['status', '--porcelain', '--untracked-files=all'])) {
    throw new Error('Prepare maintenance in a clean committed repository root matching the requested head.')
  }
  maintenanceGit(options.cwd, ['merge-base', '--is-ancestor', report.base, report.head])
  const before = maintenanceGit(options.cwd, ['show', `${report.base}:pnpm-lock.yaml`])
  const after = maintenanceGit(options.cwd, ['show', `${report.head}:pnpm-lock.yaml`])
  report.versions = detectMaintenanceVersionChange(before, after)
  if (report.versions.status !== 'changed') {
    report.status = report.versions.status === 'unchanged' ? 'unchanged' : 'blocked'
    if (report.status === 'blocked') {
      report.errors.push(report.versions.reason)
    }
    return
  }
  const require = createRequire(path.join(options.cwd, 'package.json'))
  const installed = JSON.parse(await readFile(require.resolve('repoctl/package.json'), 'utf8'))
  if (installed.name !== 'repoctl' || installed.version !== report.versions.to) {
    throw new Error('Install the exact target repoctl version from the frozen lockfile before preparing maintenance.')
  }
  const plan = await planUpgrade({ cwd: options.cwd, outDir: '.', overwriteRelease: false })
  report.plan = plan
  if (plan.status !== 'ready' || plan.files.some(file => file.status === 'conflict')) {
    throw new Error(`Root asset upgrade has conflicts: ${plan.blockers.map(blocker => blocker.detail).join('; ')}`)
  }
  // Upgrade plans use portable separators; compare the actual native directory identity.
  const migrationPath = await maintenanceMigrationPath(options.cwd, report.head, report.versions.to!, plan)
  if (await realpath(plan.rootDir) !== options.cwd || plan.files.some(file => !isRootAsset(file.path) && file.path !== migrationPath)) {
    throw new Error('Maintenance supports only managed root assets in the checked-out repository.')
  }
  const applied = await applyUpgradePlan(options.cwd, plan)
  if (applied.status === 'unchanged') {
    report.status = 'unchanged'
    return
  }
  await runCheck(options, report, 'lockfile', ['install', '--lockfile-only', '--ignore-scripts'])
  if (detectMaintenanceVersionChange(after, await readFile(path.join(options.cwd, 'pnpm-lock.yaml'), 'utf8')).status !== 'unchanged') {
    throw new Error('Asset dependency resolution changed the target repoctl version; review the dependency update separately.')
  }
  await runCheck(options, report, 'install', ['install', '--frozen-lockfile', '--ignore-scripts'])
  const scripts = JSON.parse(await readFile(path.join(options.cwd, 'package.json'), 'utf8')).scripts ?? {}
  for (const name of ['build', 'lint', 'typecheck', 'tsd', 'test']) {
    if (typeof scripts[name] === 'string' && scripts[name].trim()) {
      await runCheck(options, report, name, ['run', name])
    }
    else {
      report.checks.push({ name, args: [], status: 'skipped', log: 'No root script is declared.' })
    }
  }
  if (!report.checks.some(check => ['lint', 'typecheck', 'test'].includes(check.name) && check.status === 'passed')) {
    throw new Error('Declare at least one root lint, typecheck or test script before enabling automatic maintenance.')
  }
  await createMaintenancePatch(options, report)
}

/** Prepare a review artifact in a disposable clean checkout. Blocked runs retain their report and logs. */
export async function prepareMaintenanceUpgrade(input: MaintenanceUpgradeOptions): Promise<MaintenanceUpgradeReport> {
  const cwd = await realpath(input.cwd)
  const output = path.resolve(input.outputDirectory)
  await mkdir(output, { recursive: true })
  const outputDirectory = await realpath(output)
  if (outputDirectory === cwd || outputDirectory.startsWith(`${cwd}${path.sep}`) || (await readdir(outputDirectory)).length) {
    throw new Error('Maintenance output must be an empty directory outside the source checkout.')
  }
  const options = { ...input, cwd, outputDirectory }
  const env = input.env ?? process.env
  const report: MaintenanceUpgradeReport = {
    schemaVersion: 1,
    kind: 'repoctl-maintenance-upgrade',
    status: 'blocked',
    base: input.base,
    head: input.head ?? maintenanceGit(cwd, ['rev-parse', 'HEAD']).trim(),
    repository: env['GITHUB_REPOSITORY'] ?? null,
    runId: env['GITHUB_RUN_ID'] ?? null,
    runAttempt: env['GITHUB_RUN_ATTEMPT'] ?? null,
    branch: 'repoctl/managed-assets',
    versions: { status: 'blocked', from: null, to: null, reason: 'not-compared' },
    plan: null,
    checks: [],
    files: [],
    patchHash: null,
    errors: [],
  }
  try {
    await generate(options, report)
  }
  catch (error) {
    report.status = 'blocked'
    report.errors.push(error instanceof Error ? error.message : String(error))
  }
  await writeFile(path.join(outputDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  await writeFile(path.join(outputDirectory, 'body.md'), maintenanceBody(report))
  return report
}
