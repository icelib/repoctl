import { copyFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { deleteAsync } from 'del'
import fs from 'fs-extra'
import { appRoot, fixturesRoot } from './util'
import { createContext } from '@/core/context'

describe('context', () => {
  it('no config', async () => {
    // expect(ctx).toBeDefined()
    await expect(() => {
      return createContext()
    }).rejects.toThrowError()
  })

  it('with config in app', async () => {
    const ctx = await createContext({
      pandaConfig: {
        cwd: appRoot,
      },
    })
    expect(ctx).toBeDefined()
    expect(ctx.codegen).toBeDefined()
    expect(ctx.pandaConfig).toBeDefined()
    expect(ctx.rollback).toBeDefined()
    const src = resolve(appRoot, 'src/styled-system/helpers.mjs')
    await fs.ensureDir(dirname(src))
    await copyFile(resolve(appRoot, 'styled-system/helpers.mjs'), src)
    await ctx.codegen()
    const backup = resolve(appRoot, 'src/styled-system/_helpers.backup.mjs')
    existsSync(src)
    existsSync(backup)
    expect(await readFile(src, 'utf8')).not.toEqual(
      await readFile(backup, 'utf8'),
    )
    await ctx.rollback()
    expect(await readFile(src, 'utf8')).toEqual(await readFile(backup, 'utf8'))
  })

  it('codegen with wrapper throw error', async () => {
    const ctx = await createContext({
      pandaConfig: {
        cwd: resolve(fixturesRoot, 'app1'),
      },
    })
    await expect(() => {
      return ctx.codegen()
    }).rejects.toThrowError()
  })

  it('codegen with wrapper', async () => {
    const app0Root = resolve(fixturesRoot, 'app0')

    const ctx = await createContext({
      pandaConfig: {
        cwd: app0Root,
      },
      log: true,
    })
    const src = resolve(app0Root, ctx.pandaConfig.config.outdir, 'helpers.mjs')
    await fs.ensureDir(dirname(src))
    await copyFile(resolve(appRoot, 'styled-system/helpers.mjs'), src)
    await ctx.codegen()
    expect(existsSync(src)).toBe(true)
    expect(existsSync(resolve(dirname(src), 'weapp-panda'))).toBe(true)
  })

  it('codegen with wrapper case 2', async () => {
    const appRoot = resolve(fixturesRoot, 'app2')

    const ctx = await createContext({
      pandaConfig: {
        cwd: appRoot,
      },
      log: true,
    })
    const src = resolve(appRoot, ctx.pandaConfig.config.outdir, 'helpers.mjs')
    await fs.ensureDir(dirname(src))
    await copyFile(resolve(appRoot, 'styled-system/helpers.mjs'), src)
    await ctx.codegen()
    expect(existsSync(src)).toBe(true)
    expect(existsSync(resolve(dirname(src), 'weapp-panda'))).toBe(true)
  })

  it('init config', async () => {
    const ctx = await createContext({
      pandaConfig: {
        cwd: appRoot,
      },
    })
    const userConfigPath = resolve(
      dirname(ctx.pandaConfig.path),
      'weapp-pandacss.config.ts',
    )
    if (existsSync(userConfigPath)) {
      await deleteAsync([userConfigPath], {
        onlyFiles: true,
      })
    }

    expect(existsSync(userConfigPath)).toBe(false)
    await ctx.init()
    expect(existsSync(userConfigPath)).toBe(true)
  })
})
