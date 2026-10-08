import type { ICreateContextOptions } from '@/types'
import fs from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { getCreateContextDefaults } from '@/defaults'
import { dedent, defu } from '@/utils'
import {
  copyEscape,
  exists,
  findPandaRuntime,
  generateEscapeWrapper,
} from './codegen'
import { getPandacssConfig } from './config'
import { quote, tick } from './logger'
import { inject } from './patch'

const initialConfig = dedent`
  import { defineConfig } from 'weapp-pandacss'

  export default defineConfig({})
`

export function initConfig(projectRoot: string) {
  return fs.writeFile(
    resolve(projectRoot, 'weapp-pandacss.config.ts'),
    initialConfig,
    'utf8',
  )
}

export async function createContext(
  options?: ICreateContextOptions & { configFile?: string },
) {
  const opt = defu(options, getCreateContextDefaults())
  const pandaConfig = await getPandacssConfig(opt.pandaConfig)

  const configuredOutdir = pandaConfig.config['outdir']
  const outdir = typeof configuredOutdir === 'string'
    ? configuredOutdir
    : 'styled-system'
  const projectRoot = dirname(pandaConfig.path)
  async function codegen() {
    const words: string[] = []
    const weappPandaDir = resolve(projectRoot, outdir, 'weapp-panda')
    const runtime = await findPandaRuntime(resolve(projectRoot, outdir))
    const content = await fs.readFile(runtime.helperPath, 'utf8')
    const patched = inject(content, {
      wrapperSpecifier: `./weapp-panda/index.${runtime.extension}`,
    })
    await copyEscape(resolve(weappPandaDir, 'lib'))
    await generateEscapeWrapper(weappPandaDir, opt, runtime.extension)
    words.push(dedent`
    ${tick} ${quote(outdir, '/weapp-panda')}: the core escape function for weapp
    `)
    // Refresh the backup only when Panda has generated an unpatched runtime.
    // Repeated adapter codegen must retain the original rollback target.
    if (!patched.alreadyPatched) {
      await fs.writeFile(runtime.backupPath, content, 'utf8')
    }
    await fs.writeFile(runtime.helperPath, patched.code, 'utf8')
    words.push(dedent`
    ${tick} ${quote(
      outdir,
      `/helpers.${runtime.extension}`,
    )}: inject escape function into helpers
    `)
    if (opt.log) {
      console.log(words.filter(Boolean).join('\n'))
    }
  }

  async function rollback() {
    const runtime = await findPandaRuntime(resolve(projectRoot, outdir))
    if (await exists(runtime.backupPath)) {
      await fs.copyFile(runtime.backupPath, runtime.helperPath)
    }
  }

  function init() {
    return initConfig(projectRoot)
  }
  return {
    configFile: options?.configFile,
    pandaConfig,
    codegen,
    rollback,
    init,
  }
}
