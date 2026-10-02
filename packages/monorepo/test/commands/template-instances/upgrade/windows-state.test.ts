import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist
import { planTemplateUpgrade } from '../../../../dist/index.mjs'
import { contents, originalCode, upgradeFixture, write } from './fixtures'

it('rolls back added directories using Windows stat permission semantics', async (t) => {
  const f = await upgradeFixture(t)
  await write(f.nextSource, 'templates/tsdown/added/nested/file.ts', 'export const added = true\n')
  await write(f.nextSource, 'templates/tsdown/src/index.ts', originalCode.replace('first = 1', 'first = 2'))
  const plan = await planTemplateUpgrade(f.options)
  const before = await contents(f.cwd)
  const script = `
    import fs from 'node:fs/promises'
    import path from 'node:path'
    const [entry, serialized] = process.argv.slice(1)
    const { applyTemplateUpgradePlan } = await import(entry)
    const plan = JSON.parse(serialized)
    const target = (await fs.realpath(path.join(plan.options.cwd, plan.target))).replaceAll('\\\\', '/')
    Object.defineProperty(process, 'platform', { value: 'win32' })
    const lstat = fs.lstat.bind(fs)
    const mkdir = fs.mkdir.bind(fs)
    const rename = fs.rename.bind(fs)
    // Windows libuv reports no execute bits on directories; only the readonly attribute.
    fs.lstat = async (...args) => {
      const stat = await lstat(...args)
      const filename = String(args[0]).replaceAll('\\\\', '/')
      if (filename === target || filename.startsWith(target + '/')) {
        const mode = Number(stat.mode)
        const normalized = (mode & ~0o777) | (mode & 0o200 ? 0o666 : 0o444)
        stat.mode = typeof stat.mode === 'bigint' ? BigInt(normalized) : normalized
      }
      return stat
    }
    // Preserve traversal on a POSIX host while exposing the Windows stat contract above.
    fs.mkdir = (filename, options) => mkdir(filename,
      options && typeof options === 'object' && options.mode !== undefined ? { ...options, mode: 0o777 } : options)
    let failed = false
    fs.rename = async (from, to) => {
      if (!failed && String(to).replaceAll('\\\\', '/').endsWith('/src/index.ts')) {
        failed = true
        throw new Error('Injected Windows write failure')
      }
      return rename(from, to)
    }
    try {
      await applyTemplateUpgradePlan(plan)
      throw new Error('Expected the injected write failure')
    } catch (error) {
      if (!failed || error.message !== 'Injected Windows write failure') throw error
    }
  `
  await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script, new URL('../../../../dist/index.mjs', import.meta.url).href, JSON.stringify(plan)])
  expect(await contents(f.cwd)).toEqual(before)
  await expect(fs.stat(path.join(f.targetDir, 'added'))).rejects.toThrow()
})
