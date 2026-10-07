import path from 'node:path'
import fs from 'node:fs'
import { deleteAsync } from 'del'
import { readWantedLockfile } from '@pnpm/lockfile-file'
import { appRoot, root } from './util'
import { getPandacssConfig } from '@/core'
import {
  copyEscape,
  getPandaVersion,
  getWeappCoreEscapeDir,
} from '@/core/codegen'

describe('codegen', () => {
  it('has install WeappCoreEscape', () => {
    const dir = getWeappCoreEscapeDir()
    expect(dir).toBeDefined()
  })

  it('codegen to fixtures app', async () => {
    const { config } = await getPandacssConfig({
      cwd: appRoot,
    })

    const target = path.resolve(appRoot, config.outdir, 'weapp-panda')
    await deleteAsync([target])
    expect(fs.existsSync(target)).toBe(false)
    const res = await copyEscape(target)
    expect(res.length).toBe(5)
    for (const filename of res) {
      expect(fs.existsSync(filename)).toBe(true)
    }
  })

  it('getPandaVersion', async () => {
    const lock = await readWantedLockfile(root, {
      ignoreIncompatible: true,
    })
    expect(lock).toBeDefined()
    const versionString
      = lock?.importers['.'].devDependencies?.['@pandacss/dev']

    expect(versionString).toBeDefined()
    const idx = versionString?.indexOf('(')
    expect(getPandaVersion()).toBe(versionString?.slice(0, idx))
  })
})
