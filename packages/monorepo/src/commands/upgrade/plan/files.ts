import type { UpgradeInput, UpgradePlan } from '../../../types/upgrade'
import path from 'pathe'
import { readOptional, readOptionalSource } from '../../../core/file-transaction/paths'

export { canonicalDirectory, checkedFile, hash, readOptional, relativeFile } from '../../../core/file-transaction/paths'

/** Planning and application must validate each input with the same path policy. */
export function readUpgradeInput(plan: Pick<UpgradePlan, 'rootDir' | 'assetDir'>, input: Pick<UpgradeInput, 'area' | 'path'>) {
  if (input.area === 'asset') {
    return readOptionalSource(plan.assetDir, input.path)
  }
  const root = input.area === 'target' ? plan.rootDir : path.dirname(input.path)
  return readOptional(root, input.area === 'config' ? path.basename(input.path) : input.path)
}
