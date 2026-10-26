import type { ReleasePreparationValidationOptions, ReleasePreparationValidationReport } from './types'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'pathe'
import { resolveReleaseBranches } from '../lines/config'
import { assertProjectedLine } from '../lines/preview'
import { capturePlan, parseNativePlan, PlanError } from '../plan/native'
import { createNativeReleasePlan } from '../plan/native-report'
import { comparePreparation } from './compare'
import { readTree } from './git'
import { readExpected, writeMetadata } from './metadata'
import { validatePolicy } from './policy'

/** Verify frozen commits by replaying native versioning in disposable inert metadata. */
export async function validateReleasePreparation(options: ReleasePreparationValidationOptions): Promise<ReleasePreparationValidationReport> {
  const report: ReleasePreparationValidationReport = {
    schemaVersion: 1,
    base: options.base,
    head: options.head,
    status: 'invalid',
    pnpmVersion: null,
    packages: [],
    files: [],
    errors: [],
  }
  let isolated: string | undefined
  try {
    validatePolicy(options.policy)
    const base = readTree(options.base, options)
    const head = readTree(options.head, options)
    isolated = await mkdtemp(path.join(tmpdir(), 'repo-release-validation-'))
    const metadata = await writeMetadata(isolated, base, options)
    const nativeOptions = { ...options, cwd: isolated, branch: options.policy.branch, config: { ...(options.policy.branches ? { branches: options.policy.branches } : {}) } }
    const plan = await createNativeReleasePlan(nativeOptions)
    report.pnpmVersion = plan.pnpmVersion
    report.packages = plan.packages.map(pkg => ({ ...pkg, status: 'invalid' }))
    if (plan.status !== 'ready') {
      report.errors.push(...plan.blockers, ...(plan.status === 'empty' ? [{ id: 'empty-release-preparation', detail: 'The frozen base has no native version changes to prepare.' }] : []))
      return report
    }
    const rule = resolveReleaseBranches(options.policy.branches).find(rule => rule.branch === options.policy.branch)!
    await assertProjectedLine(rule, plan.packages, nativeOptions)
    const applied = parseNativePlan(capturePlan(['version', '-r', '--no-git-checks', '--json'], nativeOptions))
    if (applied.packages.length !== plan.packages.length || plan.packages.some(pkg => !applied.packages.some(item => item.name === pkg.name && item.currentVersion === pkg.currentVersion && item.newVersion === pkg.newVersion))) {
      throw new Error('Native replay differs from the native release plan.')
    }
    const expected = await readExpected(isolated, metadata)
    report.files = await comparePreparation(base, head, metadata.original, expected, report, options)
    const anomalies = report.files.filter(file => file.status !== 'expected' && file.status !== 'custom-verified')
    report.packages = report.packages.map(pkg => ({ ...pkg, status: anomalies.some(file => file.path.startsWith('.changeset/') || file.path === 'pnpm-workspace.yaml'
      || file.path === (pkg.directory === '.' ? 'package.json' : `${pkg.directory}/package.json`)
      || file.path === (pkg.directory === '.' ? 'CHANGELOG.md' : `${pkg.directory}/CHANGELOG.md`))
      ? 'invalid'
      : 'valid' }))
    if (!anomalies.length) {
      report.status = 'valid'
    }
  }
  catch (error) {
    report.errors.push({ id: error instanceof PlanError ? error.id : 'invalid-release-preparation', detail: error instanceof Error ? error.message : String(error) })
  }
  finally {
    if (isolated) {
      await rm(isolated, { force: true, recursive: true })
    }
  }
  return report
}

export { readReleasePreparationPolicy } from './git'
export type * from './types'
