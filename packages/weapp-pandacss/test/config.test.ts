import path from 'node:path'
import { omit } from 'lodash-es'
import { appRoot, configRoot, taroAppRoot } from './util'
import { getPandacssConfig, getUserConfig } from '@/core/config'

describe('config', () => {
  it('get fixtures app config', async () => {
    const config = await getPandacssConfig({
      cwd: appRoot,
    })
    expect(config).toBeDefined()
    expect(config.config.outdir === 'src/styled-system').toBe(true)
  })

  it('get fixtures taroApp config', async () => {
    const config = await getPandacssConfig({
      cwd: taroAppRoot,
    })
    expect(config).toBeDefined()
    expect(config.config.outdir === 'styled-system').toBe(true)
  })

  it('get default config', async () => {
    const { config } = await getUserConfig()

    expect(omit(config, ['context.pandaConfig'])).toMatchSnapshot()
  })

  it('get default config from 0.default dir', async () => {
    const { config, ...rest } = await getUserConfig({
      cwd: path.resolve(configRoot, '0.default'),
    })
    console.log(rest)
    expect(omit(config, ['context.pandaConfig'])).toMatchSnapshot()
  })
})
