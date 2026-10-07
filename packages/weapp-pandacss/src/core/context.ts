import { dirname, resolve } from 'node:path'
import fs from 'fs-extra'
import { getPandacssConfig } from './config'
import { copyEscape, generateEscapeWrapper } from './codegen'
import { patch } from './patch'
import { quote, tick } from './logger'
import type { ICreateContextOptions } from '@/types'
import { getCreateContextDefaults } from '@/defaults'
import { dedent, defu } from '@/utils'

export async function createContext(
  options?: ICreateContextOptions & { configFile?: string },
) {
  const opt = defu(options, getCreateContextDefaults())
  const pandaConfig = await getPandacssConfig(opt.pandaConfig)

  const outdir = pandaConfig.config.outdir
  const projectRoot = dirname(pandaConfig.path)
  async function codegen() {
    const words: string[] = []
    const weappPandaDir = resolve(projectRoot, outdir, 'weapp-panda')
    const patchHelpersPath = resolve(projectRoot, outdir, 'helpers.mjs')
    if (!await fs.exists(patchHelpersPath)) {
      throw new Error(
        `Cannot find runtime file: ${outdir}/helpers.mjs. Did you forget to run \`panda init\`?`,
      )
    }
    await copyEscape(resolve(weappPandaDir, 'lib'))
    await generateEscapeWrapper(weappPandaDir, opt)
    words.push(dedent`
    ${tick} ${quote(outdir, '/weapp-panda')}: the core escape function for weapp
    `)
    if (await fs.exists(patchHelpersPath)) {
      await fs.copyFile(
        patchHelpersPath,
        resolve(dirname(patchHelpersPath), '_helpers.backup.mjs'),
      )
    }

    await patch(patchHelpersPath)
    words.push(dedent`
    ${tick} ${quote(
      outdir,
      '/helpers.mjs',
    )}: inject escape function into helpers
    `)
    if (opt.log) {
      console.log(words.filter(Boolean).join('\n'))
    }
  }

  async function rollback() {
    const patchHelpersBackupPath = resolve(
      projectRoot,
      outdir,
      '_helpers.backup.mjs',
    )
    if (await fs.exists(patchHelpersBackupPath)) {
      await fs.copyFile(
        patchHelpersBackupPath,
        resolve(dirname(patchHelpersBackupPath), 'helpers.mjs'),
      )
    }
  }

  function init() {
    return fs.writeFile(
      resolve(projectRoot, 'weapp-pandacss.config.ts'),
      dedent`
      import { defineConfig } from 'weapp-pandacss'

export default defineConfig({
  
})

      `,
      'utf8',
    )
  }
  return {
    configFile: options?.configFile,
    pandaConfig,
    codegen,
    rollback,
    init,
  }
}
