import type { DevContainerPlan } from '@icebreakers/monorepo'
import { execFile } from 'node:child_process'
import { access, readdir, readFile } from 'node:fs/promises'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { planDevContainer } from '@icebreakers/monorepo'
import path from 'pathe'
import { expect, it } from 'vitest'
import { fixture } from './fixture'

const entry = pathToFileURL(path.resolve(import.meta.dirname, '../../../dist/index.mjs')).href

async function instrument(plan: DevContainerPlan, hook: string, action = 'try { await applyDevContainerPlan(root, plan) } catch (error) { process.stdout.write(error.message) }') {
  const source = `
    import fs from 'node:fs/promises'
    import path from 'node:path'
    import { syncBuiltinESMExports } from 'node:module'
    const [entry, serialized] = process.argv.slice(1)
    const plan = JSON.parse(serialized)
    const root = plan.workspaceDir
    const isTarget = (filename, name) => path.resolve(filename) === path.resolve(root, '.devcontainer', name)
    ${hook}
    syncBuiltinESMExports()
    const { applyDevContainerPlan } = await import(entry)
    ${action}
  `
  return (await promisify(execFile)(process.execPath, ['--input-type=module', '-e', source, entry, JSON.stringify(plan)], { timeout: 30000 })).stdout
}

it('rolls back publication when the workspace manifest changes during apply', async () => {
  const h = await fixture()
  const plan = await planDevContainer(h.root)
  const output = await instrument(plan, `
    const link = fs.link
    fs.link = async (source, target) => {
      await link(source, target)
      if (isTarget(target, 'Dockerfile')) {
        await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ ...${JSON.stringify(h.manifest)}, name: 'concurrent' }))
      }
    }
  `)
  expect(output).toContain('input changed')
  expect(JSON.parse(await readFile(path.join(h.root, 'package.json'), 'utf8')).name).toBe('concurrent')
  await expect(access(path.join(h.root, '.devcontainer'))).rejects.toThrow()
  await expect(access(path.join(h.root, '.repoctl'))).rejects.toThrow()
})

it('preserves a file created concurrently instead of replacing it', async () => {
  const h = await fixture()
  const plan = await planDevContainer(h.root)
  await instrument(plan, `
    const link = fs.link
    fs.link = async (source, target) => {
      if (isTarget(target, 'README.md')) await fs.writeFile(target, 'team notes')
      return link(source, target)
    }
  `)
  expect(await readdir(path.join(h.root, '.devcontainer'))).toEqual(['README.md'])
  expect(await readFile(path.join(h.root, '.devcontainer/README.md'), 'utf8')).toBe('team notes')
})

it('checks early published files again before reporting a successful application', async () => {
  const h = await fixture()
  const plan = await planDevContainer(h.root)
  const output = await instrument(plan, `
    const link = fs.link
    fs.link = async (source, target) => {
      await link(source, target)
      if (isTarget(target, 'devcontainer.json')) {
        await fs.writeFile(path.join(root, '.devcontainer/Dockerfile'), 'concurrent image choice')
      }
    }
  `)
  expect(output).toContain('Preserve concurrent edits')
  expect(await readFile(path.join(h.root, '.devcontainer/Dockerfile'), 'utf8')).toBe('concurrent image choice')
  expect(await readdir(path.join(h.root, '.devcontainer'))).toEqual(['Dockerfile'])
})

it('holds the workspace lock until a failed application finishes recovery', async () => {
  const h = await fixture()
  const plan = await planDevContainer(h.root)
  const output = await instrument(plan, `
    let enter, release
    const paused = new Promise(resolve => { enter = resolve })
    const resume = new Promise(resolve => { release = resolve })
    const open = fs.open
    fs.open = async (filename, ...args) => {
      const handle = await open(filename, ...args)
      if (path.basename(filename).startsWith('Dockerfile.repoctl-upgrade-') && filename.endsWith('.tmp')) {
        const close = handle.close.bind(handle)
        handle.close = async () => {
          await close()
          enter()
          await resume
          throw new Error('Injected staging failure')
        }
      }
      return handle
    }
  `, `
    const first = applyDevContainerPlan(root, plan).catch(error => error.message)
    await Promise.race([paused, first.then(() => { throw new Error('Staging hook was not reached') })])
    let second
    try { second = await applyDevContainerPlan(root, plan) } catch (error) { second = error.message }
    release()
    process.stdout.write(JSON.stringify({ first: await first, second }))
  `)
  expect(output).toContain('devcontainer is locked')
  expect(output).toContain('Injected staging failure')
  await expect(access(path.join(h.root, '.devcontainer'))).rejects.toThrow()
  await expect(access(path.join(h.root, '.repoctl'))).rejects.toThrow()
})
