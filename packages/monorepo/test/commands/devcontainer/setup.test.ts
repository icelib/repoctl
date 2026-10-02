import { spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { applyDevContainerPlan, planDevContainer } from '@icebreakers/monorepo'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { fixture } from './fixture'

async function setupFixture(options: { lockfile?: boolean, version?: string, installStatus?: number } = {}) {
  const h = await fixture()
  await applyDevContainerPlan(h.root, await planDevContainer(h.root))
  if (options.lockfile) {
    await writeFile(path.join(h.root, 'pnpm-lock.yaml'), 'reviewed dependency lock\n')
  }
  const preload = path.join(h.parent, 'manager.mjs')
  await writeFile(preload, `
import childProcess from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
const calls = []
childProcess.spawnSync = (command, args) => {
  calls.push({ command, args })
  writeFileSync('calls.json', JSON.stringify(calls))
  if (args.includes('--version')) {
    writeFileSync('pnpm-lock.yaml', 'manager bootstrap metadata')
    return { status: 0, stdout: ${JSON.stringify(`${options.version ?? '12.8.1'}\n`)}, stderr: '' }
  }
  return { status: ${options.installStatus ?? 0}, stdout: '', stderr: '' }
}
syncBuiltinESMExports()
`)
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, '.devcontainer/setup.mjs'], {
    cwd: h.root,
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, REPOCTL_CONTAINER_NODE_VERSION: process.versions.node },
  })
  const calls = JSON.parse(await readFile(path.join(h.root, 'calls.json'), 'utf8')) as Array<{ command: string, args: string[] }>
  return { result, calls }
}

describe('generated Dev Container setup', () => {
  it.each([false, true])('chooses install locking from the initial dependency state: existing=%s', async (lockfile) => {
    const { result, calls } = await setupFixture({ lockfile })
    expect(result.status, result.stderr).toBe(0)
    expect(calls).toHaveLength(2)
    expect(calls[1]!.args).toContain(lockfile ? '--frozen-lockfile' : '--no-frozen-lockfile')
  })

  it('rejects a different pnpm version before attempting installation', async () => {
    const { result, calls } = await setupFixture({ version: '10.0.0' })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Corepack must activate pnpm 12.8.1')
    expect(calls).toHaveLength(1)
  })

  it('reports install failure without announcing a ready container', async () => {
    const { result } = await setupFixture({ installStatus: 23 })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Workspace installation failed (23)')
    expect(result.stdout).not.toContain('Dev Container ready')
  })
})
