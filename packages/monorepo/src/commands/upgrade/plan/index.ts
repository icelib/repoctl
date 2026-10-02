import type { UpgradeOptions, UpgradePlan } from '../../../types/upgrade'
import process from 'node:process'
import { areTemplateAssetsPrepared } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import { assetsDir } from '../../../constants'
import { planAssets } from './assets'
import { createContext } from './context'
import { planVersioningMigration } from './migration'

/** Read-only: even asset preparation must be explicitly performed before previewing. */
export async function planUpgrade(options: UpgradeOptions = {}): Promise<UpgradePlan> {
  let plan: UpgradePlan = { schemaVersion: 1, cwd: path.resolve(options.cwd ?? process.cwd()), rootDir: path.resolve(options.cwd ?? process.cwd(), options.outDir ?? ''), assetDir: assetsDir, status: 'blocked', targets: [], discovery: null, inputs: [], files: [], blockers: [] }
  try {
    if (!await areTemplateAssetsPrepared()) {
      plan.blockers.push({ id: 'assets-not-prepared', path: null, detail: 'Template assets are not prepared. Reinstall the published package, or run pnpm --filter @icebreakers/monorepo-templates sync:assets in the repoctl source workspace.' })
      return plan
    }
    const context = await createContext(options)
    plan = context.plan
    const baseline = await planAssets(context)
    await planVersioningMigration(context)
    await baseline.finalize()
    plan.files.sort((a, b) => a.path.localeCompare(b.path))
    plan.inputs.sort((a, b) => `${a.area}:${a.path}`.localeCompare(`${b.area}:${b.path}`))
    plan.status = plan.blockers.length ? 'blocked' : 'ready'
  }
  catch (error) {
    plan.status = 'blocked'
    plan.blockers.push({ id: 'invalid-upgrade-input', path: null, detail: error instanceof Error ? error.message : String(error) })
  }
  return plan
}
