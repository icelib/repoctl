import { execFile } from 'node:child_process'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import path from 'pathe'
import { expect, it } from 'vitest'
import { fixture, sourceRoot } from './fixture'

it('never attempts to open actual environment files during a complete built check', async (t) => {
  const h = await fixture(t)
  await h.write('.env', 'ROOT_SECRET=never_read\n')
  await h.write('packages/app/.env.local', 'APP_SECRET=never_read\n')
  await h.write('packages/app/.dev.vars', 'WORKER_SECRET=never_read\n')
  await h.write('packages/app/.env.example', 'EXAMPLE=names_only\n')
  const script = `
    import fs from 'node:fs'
    import promises from 'node:fs/promises'
    import path from 'node:path'
    import { syncBuiltinESMExports } from 'node:module'
    const [root, entry] = process.argv.slice(1)
    const opened = []
    for (const [owner, methods] of [[fs, ['open', 'openSync', 'readFile', 'readFileSync', 'createReadStream']], [promises, ['open', 'readFile']]]) {
      for (const method of methods) {
        const original = owner[method]
        owner[method] = function(filename, ...args) {
          if (typeof filename === 'string' && ['.env', '.env.local', '.dev.vars'].includes(path.basename(filename))) opened.push(filename)
          return original.call(this, filename, ...args)
        }
      }
    }
    syncBuiltinESMExports()
    const { checkEnvironmentCache } = await import(entry)
    const report = await checkEnvironmentCache(root)
    process.stdout.write(JSON.stringify({ report, opened }))
  `
  const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script, h.root, pathToFileURL(path.join(sourceRoot, 'packages/monorepo/dist/index.mjs')).href], { timeout: 30000 })
  const { report, opened } = JSON.parse(stdout)
  expect(opened).toEqual([])
  expect(report.status).not.toBe('fail')
  expect(report.tasks[0].variables.map((item: { name: string }) => item.name)).toEqual(['EXAMPLE'])
  expect(report.tasks[0].files).toHaveLength(4)
})
