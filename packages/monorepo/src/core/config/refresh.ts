import type { LoadConfigOptions } from 'c12'
import type { MonorepoConfig } from '../../types'

/** Keep C12's resolution and merging while bypassing native ESM's immutable cache. */
export function freshConfigLoading(files: Set<string>): Pick<LoadConfigOptions<MonorepoConfig>, 'jitiOptions' | 'resolve'> {
  return {
    jitiOptions: { tryNative: false, moduleCache: false, fsCache: false },
    resolve(_source, { jiti }) {
      if (jiti) {
        jiti.import = async <T>(filename: string, options?: { default?: true }) => {
          const { bundleConfig } = await import('./bundle')
          const bundled = await bundleConfig(filename)
          for (const file of bundled.files) {
            files.add(file)
          }
          const loaded = await jiti.evalModule(bundled.code, { filename, async: true, forceTranspile: true })
          return (options?.default ? (loaded as { default?: unknown } | null)?.default ?? loaded : loaded) as T
        }
      }
      return undefined
    },
  }
}
