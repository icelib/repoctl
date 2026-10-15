import type { PackageJson } from '../../../types'
import type { UpgradeContext } from '../plan/context'
import { readdir } from 'node:fs/promises'
import path from 'pathe'
import { inspectLegacyHooks } from './inspect'

export const hookGroup = 'lefthook-migration'
export const hookTargets = ['lefthook.yml', 'package.json', 'pnpm-workspace.yaml', 'repoctl.config.ts']

/** Inspect before asset planning; never let a legacy setup be partially upgraded. */
export async function prepareHooksUpgrade(context: UpgradeContext) {
  const { plan, options } = context
  const read: typeof context.read = async (area, filename) => {
    try {
      return await context.read(area, filename)
    }
    catch (error) {
      context.conflict(filename, error)
      throw error
    }
  }
  const pkg = await read('target', 'package.json')
  const legacy = await inspectLegacyHooks(plan.rootDir, pkg ? JSON.parse(pkg.toString()) as PackageJson : {})
  const native = await read('target', 'lefthook.yml')
  const source = await read('asset', 'lefthook.yml')
  const customNative = native !== null && !native.equals(source ?? new Uint8Array())
  const complete = hookTargets.every(target => plan.targets.some(selected => target === selected || target.startsWith(`${selected}/`)))
  const manual = legacy.legacy && (legacy.custom || customNative || !complete)
  const migrate = legacy.legacy && !manual && !options.noOverwrite && !options.skipOverwrite
  const skipTargets = new Set<string>()
  if (legacy.legacy && !migrate) {
    hookTargets.forEach(target => skipTargets.add(target))
  }
  else if (customNative) {
    skipTargets.add('lefthook.yml')
  }
  // Every inspected byte participates in stale-plan detection.
  for (const filename of [...legacy.files, 'repoctl.config.ts']) {
    await read('target', filename)
  }
  const files = [...legacy.files]
  async function generated(directory: string) {
    let entries
    try {
      entries = await readdir(path.join(plan.rootDir, directory), { withFileTypes: true })
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return
      }
      throw error
    }
    for (const entry of entries) {
      const filename = `${directory}/${entry.name}`
      if (entry.isDirectory()) {
        await generated(filename)
      }
      else {
        await read('target', filename)
        files.push(filename)
      }
    }
  }
  if (migrate) {
    await generated('.husky/_')
  }
  return { migrate, manual, skipTargets, files, config: legacy.config }
}
