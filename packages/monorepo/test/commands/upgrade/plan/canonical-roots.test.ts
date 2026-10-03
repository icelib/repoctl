import { execFile } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { fixture } from './fixture'

async function probe(root: string, setup: string) {
  const script = `
    import fs from 'node:fs/promises'
    import path from 'node:path'
    import { syncBuiltinESMExports } from 'node:module'
    const [root, entry] = process.argv.slice(1)
    ${setup}
    syncBuiltinESMExports()
    const { planUpgrade } = await import(entry)
    const plan = await planUpgrade({ cwd: root, targets: ['.editorconfig'] })
    process.stdout.write(JSON.stringify(plan.blockers))
  `
  const entry = new URL('../../../../dist/index.mjs', import.meta.url).href
  return (await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script, root, entry], { timeout: 15_000 })).stdout
}

it('preserves a native Windows drive root when validating the canonical upgrade directory', async () => {
  const h = await fixture()
  const output = await probe(h.cwd, `
    const realpath = fs.realpath
    const lstat = fs.lstat
    fs.realpath = async (filename, ...args) => path.resolve(filename) === path.resolve(root)
      ? 'R:' + String.fromCharCode(92)
      : realpath(filename, ...args)
    fs.lstat = async (filename, ...args) => {
      if (filename === 'R:/') throw new Error('Reached intact Windows drive root')
      if (String(filename).includes('R:')) throw new Error('Corrupted Windows drive root')
      return lstat(filename, ...args)
    }
  `)
  expect(output).toContain('Reached intact Windows drive root')
  expect(output).not.toContain('Corrupted Windows drive root')
})

it('returns a blocked plan when every ancestor including the filesystem root is unavailable', async () => {
  const h = await fixture()
  const output = await probe(h.cwd, `
    const missing = new Set()
    let current = path.resolve(root)
    while (!missing.has(current)) {
      missing.add(current)
      current = path.dirname(current)
    }
    const realpath = fs.realpath
    let attempts = 0
    fs.realpath = async (filename, ...args) => {
      if (missing.has(path.resolve(filename))) {
        if (++attempts > missing.size) throw new Error('Unbounded canonical traversal')
        throw Object.assign(new Error('Injected missing filesystem root'), { code: 'ENOENT' })
      }
      return realpath(filename, ...args)
    }
  `)
  expect(output).toContain('Injected missing filesystem root')
  expect(output).not.toContain('Unbounded canonical traversal')
})
