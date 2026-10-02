import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Exercise real descendant processes using the built API.
import { runKnipCheck } from '../../../dist/index.mjs'
import { fakeTool, fixture } from './fixture'

const hangingTree = `
const { spawn } = require('node:child_process');
const child = spawn(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)'], { stdio: 'ignore' });
require('node:fs').writeFileSync('child.pid', String(child.pid));
process.on('SIGTERM', () => {});
setInterval(() => {}, 1000);
`

async function childPid(workspace: string) {
  let pid = 0
  await expect.poll(async () => {
    pid = Number(await readFile(path.join(workspace, 'child.pid'), 'utf8').catch(() => '0'))
    return pid
  }, { timeout: 10_000 }).toBeGreaterThan(0)
  return pid
}

async function expectStopped(pid: number) {
  await expect.poll(() => {
    try {
      process.kill(pid, 0)
      return false
    }
    catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ESRCH'
    }
  }, { timeout: 5000 }).toBe(true)
}

it('escalates cancellation to terminate the analyzer and descendants that ignore SIGTERM', async () => {
  const h = await fixture({ tool: false })
  await fakeTool(h.workspace, hangingTree)
  const controller = new AbortController()
  const pending = runKnipCheck(h.workspace, { signal: controller.signal })
  try {
    const pid = await childPid(h.workspace)
    controller.abort()
    const report = await pending
    expect(report).toMatchObject({ status: 'failed', exitCode: 2 })
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: 'ABORT_ERR' }))
    await expectStopped(pid)
  }
  finally {
    controller.abort()
    await pending
  }
})

it.skipIf(process.platform === 'win32')('handles CLI termination with a failed report and no orphaned analyzer children', async () => {
  const h = await fixture({ tool: false })
  await fakeTool(h.workspace, hangingTree)
  const cli = path.resolve(import.meta.dirname, '../../../bin/repoctl.js')
  const child = spawn(process.execPath, [cli, '--lang', 'en', 'check', 'knip', '--json'], { cwd: h.workspace })
  let stdout = ''
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk
  })
  const closed = new Promise<number | null>(resolve => child.once('close', resolve))
  try {
    const pid = await childPid(h.workspace)
    child.kill('SIGTERM')
    expect(await closed).toBe(2)
    expect(JSON.parse(stdout)).toMatchObject({ status: 'failed', exitCode: 2 })
    await expectStopped(pid)
  }
  finally {
    child.kill('SIGTERM')
    await closed
  }
})
