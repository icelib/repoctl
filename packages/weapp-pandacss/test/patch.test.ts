import fs from 'node:fs/promises'
import fss from 'node:fs'
import path from 'node:path'
import { appRoot } from './util'
import { inject, patch } from '@/core/patch'
describe('patch', () => {
  it('default', async () => {
    const content = await fs.readFile(
      path.resolve(appRoot, 'styled-system/helpers.mjs'),
      'utf8'
    )
    const { code } = inject(content)
    const target = path.resolve(appRoot, 'styled-system/helpers.injected.mjs')
    await fs.writeFile(target, code, 'utf8')

    expect(fss.existsSync(target)).toBe(true)
  })

  it('patch', async () => {
    const dest = path.resolve(appRoot, 'styled-system/helpers.patched.mjs')
    await patch(path.resolve(appRoot, 'styled-system/helpers.mjs'), dest)
    expect(fss.existsSync(dest)).toBe(true)
  })

  it('inject again', async () => {
    const src = path.resolve(appRoot, 'styled-system/helpers.injected.mjs')
    const content = await fs.readFile(src, 'utf8')
    const { code } = inject(content)
    const target = path.resolve(appRoot, 'styled-system/helpers.injected0.mjs')
    await fs.writeFile(target, code, 'utf8')

    expect(fss.existsSync(target)).toBe(true)
    expect(content).toEqual(await fs.readFile(target, 'utf8'))
  })

  it('patch again', async () => {
    const src = path.resolve(appRoot, 'styled-system/helpers.patched.mjs')
    const dest = path.resolve(appRoot, 'styled-system/helpers.patched0.mjs')
    await patch(src, dest)
    expect(fss.existsSync(dest)).toBe(true)
    expect(await fs.readFile(src, 'utf8')).toEqual(
      await fs.readFile(dest, 'utf8')
    )
  })
})
