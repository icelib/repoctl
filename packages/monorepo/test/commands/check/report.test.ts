import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'
import { createCheckReportOutput } from '@/cli/commands/check/report'
// eslint-disable-next-line antfu/no-import-dist -- Validate the public build artifact rather than the source alias.
import { runCheckWithReport } from '../../../dist/index.mjs'
import { fixture, startCli, waitForOutput } from './fixtures'

const roots: string[] = []
async function createFixture(scripts: Record<string, string>) {
  const cwd = await fixture(scripts)
  roots.push(cwd)
  return cwd
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cwd => rm(cwd, { recursive: true, force: true })))
})

describe('built check execution reports', () => {
  it('records successful commands, targets and monotonic durations', async () => {
    const cwd = await createFixture({ lint: 'node -e "console.log(12345)"', typecheck: 'node -e "process.exit(0)"' })
    const report = await runCheckWithReport({ cwd, full: true })
    expect(report).toMatchObject({ schemaVersion: 1, mode: 'full', status: 'success', exitCode: 0 })
    expect(report.tasks.map(task => task.name)).toEqual(['lint', 'typecheck'])
    for (const task of report.tasks) {
      expect(task).toMatchObject({ executable: 'pnpm', cwd, status: 'success', exitCode: 0, signal: null })
      expect(task.startedAt).toBeTypeOf('string')
      expect(task.endedAt).toBeTypeOf('string')
      expect(task.durationMs).toBeGreaterThan(0)
    }
    expect(report.durationMs).toBeGreaterThanOrEqual(report.tasks.reduce((sum, task) => sum + task.durationMs, 0))
    expect(JSON.stringify(report)).not.toContain('12345')
    const json = createCheckReportOutput(report, 'json', true)
    expect(JSON.parse(json).cwd).toBe('<cwd>')
    expect(json).not.toContain(cwd)
    expect(createCheckReportOutput(report, 'markdown', true)).toContain('| lint | pnpm lint | success |')
  })

  it.each(['lint', 'typecheck'])('retains a %s failure and skips all remaining tasks', async (failed) => {
    const cwd = await createFixture(Object.fromEntries(['lint', 'typecheck', 'test', 'build'].map(name => [name, `node -e "process.exit(${name === failed ? 7 : 0})"`])))
    const report = await runCheckWithReport({ cwd, full: true })
    expect(report.status).toBe('failed')
    expect(report.exitCode).toBe(7)
    const index = report.tasks.findIndex(task => task.name === failed)
    expect(report.tasks.slice(0, index).every(task => task.status === 'success')).toBe(true)
    expect(report.tasks[index]).toMatchObject({ status: 'failed', exitCode: 7 })
    for (const task of report.tasks.slice(index + 1)) {
      expect(task).toMatchObject({ status: 'skipped', exitCode: null, startedAt: null, endedAt: null, durationMs: 0, reason: 'previous_task_failed' })
    }
  })

  it('does not start any command when already cancelled', async () => {
    const cwd = await createFixture({ lint: 'node -e "process.exit(9)"' })
    const controller = new AbortController()
    controller.abort('SIGTERM')
    const report = await runCheckWithReport({ cwd, full: true, signal: controller.signal })
    expect(report).toMatchObject({ status: 'interrupted', exitCode: 143 })
    expect(report.tasks[0]).toMatchObject({ status: 'skipped', startedAt: null })
  })

  it('writes an isolated report after failure and preserves the exit code', async () => {
    const cwd = await createFixture({ lint: 'node -e "console.log(12345);process.exit(6)"', test: 'node -e "process.exit(0)"' })
    const result = await startCli(cwd, ['--full', '--report', 'reports/result.json', '--redact']).result
    expect(result.code).toBe(6)
    expect(result.stdout).toContain('12345')
    const raw = await readFile(path.join(cwd, 'reports/result.json'), 'utf8')
    expect(raw).not.toContain('12345')
    expect(raw).not.toContain(cwd)
    expect(JSON.parse(raw).tasks.map((task: { status: string }) => task.status)).toEqual(['failed', 'skipped'])
  })

  it('writes Markdown with real timing and rejects invalid report options before execution', async () => {
    const cwd = await createFixture({ lint: 'node -e "process.exit(0)"' })
    const result = await startCli(cwd, ['--full', '--report', 'result.md', '--report-format', 'markdown']).result
    expect(result.code, result.stderr).toBe(0)
    const markdown = await readFile(path.join(cwd, 'result.md'), 'utf8')
    expect(markdown).toContain('- Status: success')
    expect(markdown).toContain('- Duration: ')
    expect(markdown).toContain('| lint | pnpm lint | success |')
    for (const args of [['--report-format', 'markdown'], ['--report', 'invalid', '--report-format', 'csv']]) {
      const rejected = await startCli(cwd, args).result
      expect(rejected.code).not.toBe(0)
      expect(rejected.stdout).not.toContain('[check:')
    }
  })

  it.each([['--json'], ['--markdown'], ['--out', 'plan.txt']])('keeps preview option %s read only', async (...args) => {
    const cwd = await createFixture({ lint: 'node -e "require(\'fs\').writeFileSync(\'started\',\'yes\')"' })
    const result = await startCli(cwd, ['--full', ...args]).result
    expect(result.code).toBe(0)
    await expect(readFile(path.join(cwd, 'started'))).rejects.toThrow()
    const conflict = await startCli(cwd, ['--full', ...args, '--report', 'result.json']).result
    expect(conflict.code).not.toBe(0)
    await expect(readFile(path.join(cwd, 'started'))).rejects.toThrow()
    await expect(readFile(path.join(cwd, 'result.json'))).rejects.toThrow()
  })

  it.skipIf(process.platform === 'win32')('persists SIGTERM and cleans up the active script process', async () => {
    const cwd = await createFixture({ lint: 'node slow.cjs', test: 'node -e "process.exit(9)"' })
    await writeFile(path.join(cwd, 'slow.cjs'), 'require("fs").writeFileSync("child.pid", String(process.pid)); console.log("SCRIPT_READY"); setInterval(() => {}, 1000)')
    const running = startCli(cwd, ['--full', '--report', 'result.json'])
    try {
      await waitForOutput(running.child, 'SCRIPT_READY')
      running.child.kill('SIGTERM')
      const result = await running.result
      expect(result.code).toBe(143)
      const report = JSON.parse(await readFile(path.join(cwd, 'result.json'), 'utf8'))
      expect(report.status).toBe('interrupted')
      expect(report.tasks[0]).toMatchObject({ status: 'interrupted', signal: 'SIGTERM' })
      expect(report.tasks[1]).toMatchObject({ status: 'skipped', exitCode: null })
      const pid = Number(await readFile(path.join(cwd, 'child.pid'), 'utf8'))
      // Signalling pnpm's process group is synchronous; the OS reaps its descendants asynchronously.
      await expect.poll(() => {
        try {
          process.kill(pid, 0)
          return false
        }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
            throw error
          }
          return true
        }
      }, { timeout: 1000, interval: 10 }).toBe(true)
    }
    finally {
      if (running.child.exitCode === null) {
        running.child.kill('SIGTERM')
      }
      await running.result
    }
  })
})
