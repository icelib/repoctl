import { execFile } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'

/** Exercise delivered code with real replacements and distinguish identities lost by Number. */
export async function probeLargeIdentity(root: string, field: 'dev' | 'ino', tracked: string, setup: string, action: string) {
  const script = `
    import fs from 'node:fs/promises'
    import path from 'node:path'
    import { syncBuiltinESMExports } from 'node:module'
    const [root, entry] = process.argv.slice(1)
    let replaced = false
    const tracked = filename => ${tracked}
    const identify = (metadata, options) => {
      const value = replaced ? 9007199254740993n : 9007199254740992n
      Object.defineProperty(metadata, '${field}', { value: options?.bigint ? value : Number(value) })
      Object.defineProperty(metadata, '${field === 'dev' ? 'ino' : 'dev'}', { value: options?.bigint ? 7n : 7 })
      return metadata
    }
    const originalLstat = fs.lstat
    fs.lstat = async (filename, options) => {
      const metadata = await originalLstat(filename, options)
      return tracked(filename) ? identify(metadata, options) : metadata
    }
    const originalOpen = fs.open
    fs.open = async (filename, ...args) => {
      const handle = await originalOpen(filename, ...args)
      if (tracked(filename)) {
        const stat = handle.stat.bind(handle)
        handle.stat = async options => identify(await stat(options), options)
      }
      return handle
    }
    ${setup}
    syncBuiltinESMExports()
    const api = await import(entry)
    ${action}
  `
  const entry = new URL('../../dist/index.mjs', import.meta.url).href
  return (await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script, root, entry], { timeout: 30_000 })).stdout
}
