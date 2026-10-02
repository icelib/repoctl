import type { WorkspaceArtifactPlan } from '@icebreakers/monorepo'
import { execFile } from 'node:child_process'
import { chmod, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { applyWorkspaceArtifactPlan, planWorkspaceArtifact } from '@icebreakers/monorepo'
import path from 'pathe'
import { expect, it } from 'vitest'
import { fixture, snapshot } from './fixture'

const entry = pathToFileURL(path.resolve(import.meta.dirname, '../../../dist/index.mjs')).href

async function instrument(plan: WorkspaceArtifactPlan, hook: string, action: string) {
  const script = `
    import fs from 'node:fs/promises'
    import path from 'node:path'
    import { syncBuiltinESMExports } from 'node:module'
    const [entry, serialized] = process.argv.slice(1)
    const plan = JSON.parse(serialized)
    const root = plan.workspaceDir
    const output = plan.selection.output
    ${hook}
    syncBuiltinESMExports()
    const { applyWorkspaceArtifactPlan } = await import(entry)
    ${action}
  `
  return (await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script, entry, JSON.stringify(plan)], { timeout: 30000 })).stdout
}

it('restores an empty destination when source inputs change during publication', async () => {
  const h = await fixture()
  await mkdir(h.output)
  const plan = await planWorkspaceArtifact(h.root, { target: 'service', mode: 'deploy', output: h.output, offline: true })
  const result = await instrument(plan, `
    const open = fs.open
    fs.open = async (filename, ...args) => {
      const handle = await open(filename, ...args)
      if (filename === path.join(output, 'dist/index.js')) {
        const close = handle.close.bind(handle)
        handle.close = async () => {
          await close()
          await fs.writeFile(path.join(root, 'packages/core/source.js'), 'concurrent source edit')
        }
      }
      return handle
    }
  `, `
    try { await applyWorkspaceArtifactPlan(root, plan) }
    catch (error) { process.stdout.write(error.message) }
  `)
  expect(result).toContain('source inputs changed')
  expect(await readdir(h.output)).toEqual([])
  expect(await readFile(path.join(h.root, 'packages/core/source.js'), 'utf8')).toBe('concurrent source edit')
})

it('preserves a concurrent file collision instead of overwriting it', async () => {
  const h = await fixture()
  const plan = await planWorkspaceArtifact(h.root, { target: 'service', mode: 'deploy', output: h.output, offline: true })
  const result = await instrument(plan, `
    const open = fs.open
    fs.open = async (filename, ...args) => {
      if (filename === path.join(output, 'dist/index.js')) {
        await fs.writeFile(filename, 'concurrent output')
      }
      return open(filename, ...args)
    }
  `, `
    try { await applyWorkspaceArtifactPlan(root, plan) }
    catch (error) { process.stdout.write(error.message) }
  `)
  expect(result).toContain('preserve concurrent files')
  expect(await readFile(path.join(h.output, 'dist/index.js'), 'utf8')).toBe('concurrent output')
  expect(await readdir(h.output)).not.toContain('.repoctl-artifact.json')
})

it('locks identical concurrent plans until the first publication finishes rollback', async () => {
  const h = await fixture()
  const plan = await planWorkspaceArtifact(h.root, { target: 'service', mode: 'deploy', output: h.output, offline: true })
  const result = await instrument(plan, `
    let enter, release
    const paused = new Promise(resolve => { enter = resolve })
    const resume = new Promise(resolve => { release = resolve })
    const open = fs.open
    fs.open = async (filename, ...args) => {
      const handle = await open(filename, ...args)
      if (filename === path.join(output, 'dist/index.js')) {
        const close = handle.close.bind(handle)
        handle.close = async () => {
          await close()
          enter()
          await resume
          throw new Error('Injected publication failure')
        }
      }
      return handle
    }
  `, `
    const first = applyWorkspaceArtifactPlan(root, plan).catch(error => error.message)
    await paused
    let second
    try { second = await applyWorkspaceArtifactPlan(root, plan) } catch (error) { second = error.message }
    release()
    process.stdout.write(JSON.stringify({ first: await first, second }))
  `)
  expect(result).toContain('workspace-artifacts is locked')
  expect(result).toContain('Injected publication failure')
  expect(result).not.toContain('unchanged')
})

it('reports native peer failures and leaves the source and destination intact', async () => {
  const h = await fixture()
  const before = await snapshot(h.root)
  const bin = path.join(h.parent, 'bin')
  await mkdir(bin)
  const code = `const fs = require('node:fs'); const path = require('node:path');
    if (process.argv.includes('--version')) console.log('12.8.1');
    else if (process.argv.includes('--help')) console.log('--prod --legacy');
    else if (process.argv.includes('config')) console.log('undefined');
    else { const out = process.argv.at(-1); fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'partial'), 'partial'); console.error('ERR_PNPM_DEPLOY_AMBIGUOUS_PEER: conflicting fixture peers'); process.exitCode = 7; }
  `
  const launcher = path.join(bin, process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')
  if (process.platform === 'win32') {
    await writeFile(path.join(bin, 'fake.cjs'), code)
    await writeFile(launcher, `@"${process.execPath}" "%~dp0fake.cjs" %*\r\n`)
  }
  else {
    await writeFile(launcher, `#!/usr/bin/env node\n${code}`)
    await chmod(launcher, 0o755)
  }
  const script = `
    const { planWorkspaceArtifact, applyWorkspaceArtifactPlan } = await import(process.argv[1])
    try {
      const plan = await planWorkspaceArtifact(process.argv[2], { target: 'service', mode: 'deploy', output: process.argv[3], offline: true })
      await applyWorkspaceArtifactPlan(process.argv[2], plan)
    } catch (error) { process.stdout.write(error.message) }
  `
  const result = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script, entry, h.root, h.output], { env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env['PATH']}` }, timeout: 30000 })
  expect(result.stdout).toContain('exit 7')
  expect(result.stdout).toContain('ERR_PNPM_DEPLOY_AMBIGUOUS_PEER')
  expect(await snapshot(h.root)).toEqual(before)
  expect(await readdir(h.parent)).not.toContain('output')
})

it('honors cancellation before creating staging or output', async () => {
  const h = await fixture()
  const plan = await planWorkspaceArtifact(h.root, { target: 'service', mode: 'deploy', output: h.output, offline: true })
  const before = await snapshot(h.root)
  const signal = AbortSignal.abort()
  await expect(applyWorkspaceArtifactPlan(h.root, plan, { signal })).rejects.toThrow()
  expect(await snapshot(h.root)).toEqual(before)
  expect(await readdir(h.parent)).toEqual(['source'])
})
