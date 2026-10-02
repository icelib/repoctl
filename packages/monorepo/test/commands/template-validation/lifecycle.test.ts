import { readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'
import { execa } from 'execa'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { cliPath, exists, fixture, loadRepo } from './fixtures'

let repo: Awaited<ReturnType<typeof loadRepo>>
beforeAll(async () => {
  repo = await loadRepo()
}, 30_000)

async function waitForService(name: string) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    for (const root of (await readdir(tmpdir())).filter(item => item.startsWith('repoctl-template-validation-'))) {
      const file = path.join(tmpdir(), root, 'sample-0/packages', name, 'service.json')
      if (await exists(file)) {
        return JSON.parse(await readFile(file, 'utf8')) as { pid: number, port: number }
      }
    }
    await setTimeout(30)
  }
  throw new Error('The generated service never started.')
}

const service = `import { createServer } from 'node:http'
import { writeFileSync } from 'node:fs'
const server = createServer((request, response) => response.end('ready'))
server.listen(0, '127.0.0.1', () => writeFileSync('service.json', JSON.stringify({pid: process.pid, port: server.address().port})))
`

describe('validation process ownership', () => {
  it('removes inherited Git pointers from generated script environments', async () => {
    const options = await fixture({
      category: 'tool',
      files: { 'tasks.mjs': `import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
assert.equal(process.env.GIT_DIR, undefined)
assert.equal(process.env.GIT_WORK_TREE, undefined)
assert.notEqual(spawnSync('git', ['rev-parse', '--show-toplevel'], {encoding: 'utf8'}).status, 0)
` },
    })
    vi.stubEnv('GIT_DIR', options.cwd)
    vi.stubEnv('GIT_WORK_TREE', options.cwd)
    try {
      const report = await repo.validateTemplate(options)
      expect(report.status, JSON.stringify(report)).toBe('passed')
    }
    finally {
      vi.unstubAllEnvs()
    }
  }, 60_000)

  it('interrupts its generated service and cleans the temporary workspace', async () => {
    const options = await fixture({ scripts: { build: 'node service.mjs' }, files: { 'service.mjs': service } })
    const controller = new AbortController()
    const name = `interrupt-${process.pid}`
    const pending = repo.validateTemplate({ ...options, names: [name], signal: controller.signal })
    try {
      const active = await waitForService(name)
      expect(await (await fetch(`http://127.0.0.1:${active.port}`)).text()).toBe('ready')
      controller.abort('SIGINT')
      const report = await pending
      expect(report.status).toBe('interrupted')
      expect(report.samples[0]?.failedStage).toBe('build')
      expect(await exists(path.join(report.temporaryDirectory!, 'sample-0/package.json'))).toBe(false)
      await expect(fetch(`http://127.0.0.1:${active.port}`)).rejects.toThrow()
    }
    finally {
      controller.abort()
      await pending
    }
  }, 60_000)

  it.skipIf(process.platform === 'win32')('handles CLI SIGINT with a final report and no server or temporary files', async () => {
    const options = await fixture({ scripts: { build: 'node service.mjs' }, files: { 'service.mjs': service } })
    const name = `cli-interrupt-${process.pid}`
    const child = execa(process.execPath, [cliPath, 'templates', 'validate', 'custom', '--fixture', options.fixtureDir, '--name', name, '--json'], {
      cwd: options.cwd,
      reject: false,
      env: { CI: 'true', TEST: undefined, VITEST: undefined, NODE_ENV: 'production' },
    })
    try {
      const active = await waitForService(name)
      child.kill('SIGINT')
      const result = await child
      expect(result.exitCode).toBe(130)
      const report = JSON.parse(result.stdout)
      expect(report.status).toBe('interrupted')
      expect(await exists(path.join(report.temporaryDirectory, 'sample-0/package.json'))).toBe(false)
      await expect(fetch(`http://127.0.0.1:${active.port}`)).rejects.toThrow()
    }
    finally {
      child.kill('SIGTERM')
      await child
    }
  }, 60_000)

  it('preserves failed diagnostics only when requested and caps hanging commands', async () => {
    const options = await fixture({ scripts: { build: 'node service.mjs' }, files: { 'service.mjs': service } })
    const report = await repo.validateTemplate({ ...options, timeoutMs: 10_000, keep: 'failure' })
    try {
      expect(report.status).toBe('failed')
      expect(report.retained).toBe(true)
      expect(await exists(path.join(report.temporaryDirectory!, 'report.json'))).toBe(true)
      const sample = report.samples[0]!
      expect(sample.failedStage).toBe('build')
      expect(sample.steps.at(-1)?.command?.output).toContain('timed out')
      const active = JSON.parse(await readFile(path.join(sample.directory, 'packages/validation-sample/service.json'), 'utf8'))
      await expect(fetch(`http://127.0.0.1:${active.port}`)).rejects.toThrow()
    }
    finally {
      await rm(report.temporaryDirectory!, { recursive: true, force: true })
    }
  }, 60_000)
})
