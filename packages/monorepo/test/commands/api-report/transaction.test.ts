import type { PublicApiUpdatePlan } from '@icebreakers/monorepo'
import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { applyPublicApiUpdate, planPublicApiUpdate } from '@icebreakers/monorepo'
import path from 'pathe'
import { expect, it } from 'vitest'
import { config, setup, snapshot } from './fixture'

async function instrument(plan: PublicApiUpdatePlan, hook: string, action: string) {
  const script = `
    import fs from 'node:fs/promises'
    import path from 'node:path'
    import { syncBuiltinESMExports } from 'node:module'
    const [entry, serialized] = process.argv.slice(1)
    const plan = JSON.parse(serialized)
    const root = plan.report.workspaceDir
    ${hook}
    syncBuiltinESMExports()
    const { applyPublicApiUpdate } = await import(entry)
    ${action}
  `
  return (await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script, pathToFileURL(path.resolve(import.meta.dirname, '../../../dist/index.mjs')).href, JSON.stringify(plan)], { timeout: 30_000 })).stdout
}

it('holds the API update lock through no-op detection and rollback of a failed new baseline', async () => {
  const root = await setup()
  const plan = await planPublicApiUpdate(root)
  const before = await snapshot(root)
  const result = await instrument(plan, `
    let enter, release
    const paused = new Promise(resolve => { enter = resolve })
    const resume = new Promise(resolve => { release = resolve })
    const rm = fs.rm
    let injected = false
    fs.rm = async (filename, ...args) => {
      if (!injected && path.resolve(filename).startsWith(path.resolve(root, 'etc/sdk.api.md') + '.repoctl-upgrade-') && filename.endsWith('.tmp')) {
        injected = true
        enter()
        await resume
        throw new Error('Injected baseline unlink failure')
      }
      return rm(filename, ...args)
    }
  `, `
    const first = applyPublicApiUpdate(root, plan).catch(error => error.message)
    await paused
    let second
    try { second = await applyPublicApiUpdate(root, plan) } catch (error) { second = error.message }
    release()
    process.stdout.write(JSON.stringify({ first: await first, second }))
  `)
  expect(result).toContain('Injected baseline unlink failure')
  expect(result).toContain('Operation api-reports is locked')
  expect(result).not.toContain('unchanged')
  expect(await snapshot(root)).toEqual(before)
})

it('preserves another writer lock and requires explicit recovery before retrying', async () => {
  const root = await setup()
  const plan = await planPublicApiUpdate(root)
  await mkdir(path.join(root, '.repoctl'))
  await writeFile(path.join(root, '.repoctl/api-reports.lock'), 'existing writer')
  const before = await snapshot(root)
  await expect(applyPublicApiUpdate(root, plan)).rejects.toThrow('locked')
  expect(await snapshot(root)).toEqual(before)
})

it('retains a concurrent edited baseline and its recovery path after apply failure', async () => {
  const root = await setup()
  const plan = await planPublicApiUpdate(root)
  const result = await instrument(plan, `
    const rm = fs.rm
    let injected = false
    fs.rm = async (filename, ...args) => {
      if (!injected && path.resolve(filename).startsWith(path.resolve(root, 'etc/sdk.api.md') + '.repoctl-upgrade-') && filename.endsWith('.tmp')) {
        injected = true
        await fs.writeFile(path.join(root, 'etc/sdk.api.md'), 'Concurrent business edit')
        throw new Error('Injected apply failure')
      }
      return rm(filename, ...args)
    }
  `, `
    try { await applyPublicApiUpdate(root, plan) }
    catch (error) { process.stdout.write(error.message) }
  `)
  expect(result).toContain('recover original files')
  expect(await readFile(path.join(root, 'etc/sdk.api.md'), 'utf8')).toBe('Concurrent business edit')
})

it('revalidates compiler inputs after staging before any baseline becomes visible', async () => {
  const root = await setup()
  await config(root, { '.': { entryPoint: 'dist/index.d.ts', baseline: 'etc/sdk.api.md' }, './feature': { entryPoint: 'dist/feature.d.ts', baseline: 'etc/feature.api.md' } })
  const plan = await planPublicApiUpdate(root)
  const result = await instrument(plan, `
    const open = fs.open
    let injected = false
    fs.open = async (filename, ...args) => {
      const handle = await open(filename, ...args)
      if (!injected && path.resolve(filename).startsWith(path.resolve(root, 'etc/sdk.api.md') + '.repoctl-upgrade-') && filename.endsWith('.tmp')) {
        injected = true
        await fs.appendFile(path.join(root, 'packages/sdk/dist/index.d.ts'), '\\n// modified after analysis\\n')
      }
      return handle
    }
  `, `
    try { await applyPublicApiUpdate(root, plan) }
    catch (error) { process.stdout.write(error.message) }
  `)
  expect(result).toContain('API compiler input changed during update')
  await expect(readFile(path.join(root, 'etc/sdk.api.md'))).rejects.toThrow('ENOENT')
  await expect(readFile(path.join(root, 'etc/feature.api.md'))).rejects.toThrow('ENOENT')
})
