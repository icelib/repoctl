import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const cli = path.resolve(import.meta.dirname, '../../../../../repoctl/bin/repo.js')
let cwd: string
beforeEach(async () => {
  cwd = await mkdtemp(path.join(os.tmpdir(), 'npmmirror-built-'))
  await writeFile(path.join(cwd, 'preload.mjs'), `
import { appendFileSync } from 'node:fs'
import path from 'node:path'
globalThis.fetch = async (url, init) => {
  appendFileSync(path.join(process.cwd(), 'requests.jsonl'), JSON.stringify({ url, method: init.method || 'GET', body: init.body }) + '\\n')
  if (String(url).includes('/syncs')) {
    return Response.json({ ok: true, id: 'built-task', state: process.env.TASK_STATE || 'success', error: 'upstream failed' })
  }
  return Response.json({ versions: { '1.0.0': {} }, 'dist-tags': { latest: '1.0.0' } })
}
`)
})
afterEach(async () => {
  await rm(cwd, { recursive: true, force: true })
})

function run(args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, ['--import', pathToFileURL(path.join(cwd, 'preload.mjs')).href, cli, 'release', 'sync-npmmirror', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, NODE_ENV: 'production', CONSOLA_LEVEL: '3', REPO_RELEASE_PUBLISHED_PACKAGES: undefined, REPO_RELEASE_PUBLISH_SUMMARY: undefined, GITHUB_STEP_SUMMARY: undefined, NO_COLOR: '1', ...env },
  })
}

async function requests() {
  return (await readFile(path.join(cwd, 'requests.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
}

describe('built npmmirror CLI', () => {
  it('accepts real afterPublish input and waits for mirror metadata', async () => {
    const result = run(['--published'], { REPO_RELEASE_PUBLISHED_PACKAGES: JSON.stringify([{ name: '@scope/pkg', version: '1.0.0' }]) })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('npmmirror success: @scope/pkg@1.0.0')
    const calls = await requests()
    expect(calls.filter(call => call.method === 'PUT')).toHaveLength(1)
    expect(calls.some(call => call.url.startsWith('https://registry.npmmirror.com/'))).toBe(true)
  })

  it('previews targets without creating tasks or writing the Actions summary', async () => {
    const summary = path.join(cwd, 'summary.md')
    await writeFile(summary, 'existing')
    const result = run(['--package', 'repoctl', '--dry-run'], { GITHUB_STEP_SUMMARY: summary })
    expect(result.status, result.stderr).toBe(0)
    expect((await requests()).every(call => call.method === 'GET')).toBe(true)
    expect(await readFile(summary, 'utf8')).toBe('existing')
  })

  it('returns a failed manual status, an Actions warning, and a useful retry summary', async () => {
    const summary = path.join(cwd, 'summary.md')
    const result = run(['--package', 'repoctl', '--version', '1.0.0'], {
      TASK_STATE: 'error',
      GITHUB_ACTIONS: 'true',
      GITHUB_STEP_SUMMARY: summary,
    })
    expect(result.status, JSON.stringify(result)).toBe(1)
    expect(result.stdout).toContain('::warning::')
    expect(await readFile(summary, 'utf8')).toContain('pnpm exec repo release sync-npmmirror --package repoctl --version 1.0.0')
    expect(await readFile(summary, 'utf8')).toContain('built-task')
  })

  it('rejects conflicting sources and missing release input before HTTP calls', async () => {
    expect(run(['--all', '--published']).status).toBe(1)
    expect(run(['--published']).status).toBe(1)
    await expect(readFile(path.join(cwd, 'requests.jsonl'), 'utf8')).rejects.toThrow()
  })

  it('treats an empty publish result as a successful no-op', () => {
    const result = run(['--published'], { REPO_RELEASE_PUBLISHED_PACKAGES: '[]' })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('skipping npmmirror')
  })

  it('keeps the CLI version separate from package versions and accepts language after subcommands', () => {
    const result = run(['--package', 'repoctl', '--version', '1.0.0', '--dry-run', '--lang', 'zh-CN'])
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('repoctl@1.0.0')
    const version = spawnSync(process.execPath, [cli, '--version'], { cwd, encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production' } })
    expect(version.status).toBe(0)
    expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/u)
  })
})
