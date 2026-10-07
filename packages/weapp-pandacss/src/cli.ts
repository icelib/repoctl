import { cac } from 'cac'
import { createContext, getUserConfig } from './core'

let ctx: Awaited<ReturnType<typeof createContext>>

async function initCtx() {
  if (ctx) {
    return ctx
  }
  const { config, configFile } = await getUserConfig()
  ctx = await createContext({
    configFile,
    ...config?.context,
    log: true,
  })
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
  await initCtx()
  await ctx.init()
  console.log('✨ weapp-pandacss config initialized!')
})

cli.help()

cli.parse()
