import process from 'node:process'
import { cac } from 'cac'
import { createContext, getUserConfig, initConfig } from './core'

let ctx: Awaited<ReturnType<typeof createContext>>

async function initCtx() {
  if (ctx) {
    return ctx
  }
  const { config, configFile } = await getUserConfig()
  const contextOptions = { ...config?.context, log: true as const }
  if (configFile) {
    Object.assign(contextOptions, { configFile })
  }
  ctx = await createContext(contextOptions)
  return ctx
}

const cli = cac()

cli.command('codegen', 'code generate').action(async () => {
  await initCtx()
  await ctx.codegen()
})

cli.command('rollback', 'rollback inject').action(async () => {
  await initCtx()
  await ctx.rollback()
})

cli.command('init', 'init config file').action(async () => {
  await initConfig(process.cwd())
  console.log('✨ weapp-pandacss config initialized!')
})

cli.help()

cli.parse()
