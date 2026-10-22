import type { UpgradeInput, UpgradePlan } from '../../../types/upgrade'
import path from 'pathe'
import { readOptional, readOptionalSource } from '../../../core/file-transaction/paths'

export { canonicalDirectory, checkedFile, hash, readOptional, relativeFile } from '../../../core/file-transaction/paths'

type InputLocation = Pick<UpgradeInput, 'area' | 'path'>

/** Schema-v1 plans and recovery journals previously classified this manifest as config. */
export function normalizeUpgradeInput(plan: Pick<UpgradePlan, 'assetDir'>, input: InputLocation): InputLocation {
  if (input.area === 'config' && input.path === path.resolve(plan.assetDir, '../package.json')) {
    return { area: 'package', path: 'package.json' }
  }
  return input
}

/** Planning and application must validate each input with the same path policy. */
export function readUpgradeInput(plan: Pick<UpgradePlan, 'rootDir' | 'assetDir'>, location: InputLocation) {
  const input = normalizeUpgradeInput(plan, location)
  if (input.area === 'asset') {
    return readOptionalSource(plan.assetDir, input.path)
  }
  if (input.area === 'package') {
    if (input.path !== 'package.json') {
      throw new Error('Invalid template package input.')
    }
    return readOptionalSource(path.dirname(plan.assetDir), input.path)
  }
  const root = input.area === 'target' ? plan.rootDir : path.dirname(input.path)
  return readOptional(root, input.area === 'config' ? path.basename(input.path) : input.path)
}
