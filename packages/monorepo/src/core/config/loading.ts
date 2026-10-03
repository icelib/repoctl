import type { LoadConfigOptions } from 'c12'
import type { MonorepoConfig } from '../../types'
import { freshConfigLoading } from './refresh'
import { assertMonorepoConfig } from './validation'

/** Check original exports before C12 merging can discard nulls or unknown empty values. */
export function validatedConfigLoading(files: Set<string>, refresh: boolean): Pick<LoadConfigOptions<MonorepoConfig>, 'jitiOptions' | 'resolve'> {
  const fresh = refresh ? freshConfigLoading(files) : undefined
  const wrapped = new WeakSet<object>()
  return {
    ...fresh,
    async resolve(source, options) {
      await fresh?.resolve?.(source, options)
      const jiti = options.jiti
      if (jiti && (refresh || !wrapped.has(jiti))) {
        wrapped.add(jiti)
        const importConfig = jiti.import.bind(jiti)
        jiti.import = async <T>(filename: string, importOptions?: { default?: true }) => {
          const result = await importConfig<unknown>(filename, importOptions)
          if (typeof result === 'function') {
            return (async (...args: unknown[]) => {
              const config = await result(...args)
              assertMonorepoConfig(config)
              return config
            }) as T
          }
          assertMonorepoConfig(result)
          return result as T
        }
      }
      return undefined
    },
  }
}
