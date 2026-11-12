import type { PublishedPackage } from '../types'
import { stringify } from 'yaml'

/** 使用可原位编辑的 YAML，允许 pnpm 为新依赖追加精确版本例外。 */
export function consumerWorkspace(packages?: readonly PublishedPackage[]) {
  return stringify({
    packages: [],
    // 仅豁免本轮已确认的版本，其余依赖保留 pnpm 默认的冷却策略。
    ...(packages ? { minimumReleaseAgeExclude: packages.map(pkg => `${pkg.name}@${pkg.version}`) } : {}),
  }, { collectionStyle: 'block' })
}
