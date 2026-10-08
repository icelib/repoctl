import type { UserInputConfig } from 'c12'
import type { PandacssConfigFileOptions, UserConfig } from '@/types'
import process from 'node:process'
import { loadConfig as loadConfigFile } from '@pandacss/config'
import { createDefineConfig, loadConfig } from 'c12'
import { getCreateContextDefaults, getPostcssPluginDefaults } from '@/defaults'
import { defu } from '@/utils'

export function getPandacssConfig(
  options?: Partial<PandacssConfigFileOptions>,
) {
  const opt = defu<PandacssConfigFileOptions, PandacssConfigFileOptions[]>(
    options,
    {
      cwd: process.cwd(),
    },
  )

  return loadConfigFile(opt)
}

export function getUserConfig(options?: Pick<UserInputConfig, 'cwd'>) {
  return loadConfig<UserConfig>({
    name: 'weapp-pandacss', // `${name}.config` //
    rcFile: false,
    globalRc: false,
    cwd: options?.cwd,
    defaults: {
      context: getCreateContextDefaults(),
      postcss: getPostcssPluginDefaults(),
    },
  })
}
export const defineConfig = createDefineConfig<UserConfig>()
// export function defineConfig(config: UserConfig) {
//   return config
// }
