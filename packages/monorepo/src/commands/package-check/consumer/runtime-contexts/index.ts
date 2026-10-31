import type { ConsumerEntry, ConsumerRuntimeContext, PackedManifest } from '../../types'
import { consumerAssetSource } from '../runtime-assets'
import { expectedErrorConsumerSource } from './source'
import { vitestConsumerInvocation } from './vitest'

function exactSubpath(value: string): boolean {
  return value === '.' || (value.startsWith('./') && !value.includes('*') && !value.includes('\\') && value.slice(2).split('/').every(segment => segment && segment !== '.' && segment !== '..'))
}

function runtimeContext(value: unknown): value is ConsumerRuntimeContext {
  if (value === 'vitest') {
    return true
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const context = value as Record<string, unknown>
  return Object.keys(context).sort().join(',') === 'kind,message,name'
    && context['kind'] === 'expected-error' && context['name'] === 'Error'
    && typeof context['message'] === 'string' && context['message'].trim().length > 0
}

/** 校验精确入口的运行合同，不改变其他入口的默认 Node 行为。 */
export function consumerRuntimeContexts(manifest: PackedManifest): Map<string, ConsumerRuntimeContext> {
  const contexts = manifest.repoctl?.packageCheck?.runtimeContexts
  const result = new Map<string, ConsumerRuntimeContext>()
  if (contexts === undefined) {
    return result
  }
  if (!contexts || typeof contexts !== 'object' || Array.isArray(contexts)) {
    throw new TypeError('packageCheck.runtimeContexts must be an object of exact export subpaths.')
  }
  for (const [subpath, context] of Object.entries(contexts)) {
    if (!exactSubpath(subpath) || !runtimeContext(context)) {
      throw new TypeError('packageCheck.runtimeContexts requires an exact export and a supported runtime contract.')
    }
    if (context === 'vitest' && ![manifest.dependencies, manifest.optionalDependencies, manifest.peerDependencies].some(dependencies => typeof dependencies?.['vitest'] === 'string' && dependencies['vitest'].trim())) {
      throw new Error('A Vitest runtime context requires a declared Vitest dependency or peer.')
    }
    result.set(subpath, context)
  }
  return result
}

/** 运行合同必须指向已打包、无资源合同冲突的单一 ESM 入口。 */
export function validateRuntimeContextEntries(manifest: PackedManifest, files: string[], entries: ConsumerEntry[], contexts: ReadonlyMap<string, ConsumerRuntimeContext>): void {
  for (const subpath of contexts.keys()) {
    const matches = entries.filter(entry => entry.subpath === subpath && entry.runtime)
    if (!matches.length || matches.some(entry => entry.asset || entry.format !== 'esm' || !exactSubpath(entry.target) || entry.target === '.' || !files.includes(entry.target.slice(2)))) {
      throw new Error(`Runtime context ${manifest.name}${subpath.slice(1)} must name a packed ESM export without a runtime asset contract.`)
    }
  }
}

/** 打包前后消费者共享入口执行方式，并继续真实解析、导入或运行 setup。 */
export async function consumerRuntimeInvocation(entry: ConsumerEntry, specifier: string, directory: string, installed: string): Promise<string[]> {
  if (entry.context === 'vitest') {
    return vitestConsumerInvocation(entry, specifier, directory, installed)
  }
  const source = typeof entry.context === 'object'
    ? `${consumerAssetSource(entry, specifier, installed)}\n${expectedErrorConsumerSource(specifier, entry.context)}`
    : entry.asset
      ? consumerAssetSource(entry, specifier, installed)
      : entry.format === 'esm' ? `await import(${JSON.stringify(specifier)})` : `require(${JSON.stringify(specifier)})`
  return ['--input-type', entry.format === 'esm' ? 'module' : 'commonjs', '--eval', source]
}
