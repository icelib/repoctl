import type { ReleasePlan, ReleasePlanOptions } from './types'
import { assertReleaseLineVersions, readReleaseBranches } from '../lines'
import { assertProjectedLine } from '../lines/preview'
import { getReleaseEnv } from '../shared'
import { PlanError } from './native'
import { createNativeReleasePlan, emptyReleasePlan } from './native-report'

/** Preview unconsumed intents under one explicit release line, without executing hooks or writes. */
export async function createReleasePlan(options: ReleasePlanOptions): Promise<ReleasePlan> {
  let report = emptyReleasePlan(options)
  try {
    const rules = await readReleaseBranches(options)
    const currentBranch = getReleaseEnv(options)['GITHUB_REF_NAME']
    const requested = options.branch ?? rules.find(rule => rule.branch === currentBranch)?.branch ?? rules[0]!.branch
    const selected = rules.find(rule => rule.branch === requested)
    if (!selected) {
      throw new PlanError('unknown-release-branch', 'Select a configured release branch.')
    }
    report = await createNativeReleasePlan(options)
    report.branchRule = selected
    if (report.status !== 'blocked') {
      await assertProjectedLine(selected, report.packages, { ...options, cwd: report.cwd })
      assertReleaseLineVersions(selected, report.packages.filter(pkg => pkg.publishCandidate).map(pkg => ({ name: pkg.name, version: pkg.newVersion })))
    }
  }
  catch (error) {
    report.status = 'blocked'
    report.packages = []
    report.notes = { packages: [], entries: [], contributors: [], compareUrls: [] }
    report.blockers.push({ id: error instanceof PlanError ? error.id : 'invalid-release-input', detail: error instanceof Error ? error.message : String(error) })
  }
  return report
}

export type { ReleasePlan, ReleasePlanOptions, ReleasePlanPackage } from './types'
