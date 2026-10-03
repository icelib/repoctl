import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import path from 'pathe'
import { expect, it } from 'vitest'
import { fixture, snapshot } from './fixture'

/** Exercise the shipped planner with distinct IDs that collide only in Number representation. */
async function inspect(workspace: string, field: 'dev' | 'ino', replaced: boolean) {
  const script = `
    import fs from 'node:fs/promises'
    import path from 'node:path'
    import { syncBuiltinESMExports } from 'node:module'
    const [entry, workspace, field, replaced] = process.argv.slice(1)
    const target = path.resolve(workspace, 'packages/old/index.js')
    const identify = (stat, options, opened) => {
      const value = opened && replaced === 'true' ? 9007199254740993n : 9007199254740992n
      Object.defineProperty(stat, field, { value: options?.bigint ? value : Number(value) })
      return stat
    }
    const lstat = fs.lstat
    fs.lstat = async (file, options) => {
      const stat = await lstat(file, options)
      return path.resolve(file) === target ? identify(stat, options, false) : stat
    }
    const open = fs.open
    fs.open = async (file, ...args) => {
      const handle = await open(file, ...args)
      if (path.resolve(file) === target) {
        const stat = handle.stat.bind(handle)
        handle.stat = async options => identify(await stat(options), options, true)
      }
      return handle
    }
    syncBuiltinESMExports()
    const { planWorkspaceRemoval } = await import(entry)
    try {
      process.stdout.write(JSON.stringify(await planWorkspaceRemoval(workspace, { target: 'old' })))
    }
    catch (error) {
      process.stdout.write(JSON.stringify({ error: error.message }))
    }
  `
  const entry = pathToFileURL(path.resolve(import.meta.dirname, '../../../dist/index.mjs')).href
  const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script, entry, workspace, field, String(replaced)], { timeout: 30_000 })
  return JSON.parse(stdout) as { error?: string, canApply?: boolean, inventory?: Array<{ path: string, size: number, mode: number, mtimeMs: number }> }
}

it.each(['dev', 'ino'] as const)('rejects a replacement file whose large %s collides after Number rounding', async (field) => {
  const h = await fixture()
  const before = await snapshot(h.root)
  const report = await inspect(h.workspace, field, true)
  expect(report.error).toContain('entry changed while opening')
  expect(await snapshot(h.root)).toEqual(before)
})

it.each(['dev', 'ino'] as const)('accepts a stable large %s and keeps the inventory JSON serializable', async (field) => {
  const h = await fixture()
  const report = await inspect(h.workspace, field, false)
  expect(report.error).toBeUndefined()
  expect(report.canApply).toBe(true)
  const file = report.inventory!.find(item => item.path === 'index.js')!
  expect(file.size).toBe(Buffer.byteLength('module.exports = 42\n'))
  expect(typeof file.mode).toBe('number')
  expect(Number.isFinite(file.mtimeMs)).toBe(true)
})
