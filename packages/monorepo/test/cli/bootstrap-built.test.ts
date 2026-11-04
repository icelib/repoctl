import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it } from 'vitest'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  const cwd = await mkdtemp(path.join(tmpdir(), 'bootstrap-cli-preflight-'))
  directories.push(cwd)
  await writeFile(path.join(cwd, 'package.json'), '{"name":"bootstrap-cli-fixture","private":true}\n')
  await writeFile(path.join(cwd, 'repoctl.config.mjs'), 'import { writeFileSync } from "node:fs"; writeFileSync(new URL("./CONFIG_EXECUTED", import.meta.url), "bad"); throw new Error("candidate config must not run")')
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' }
  for (const key of Object.keys(env)) {
    if (key.startsWith('GITHUB_') || key.startsWith('ACTIONS_') || ['NPM_TOKEN', 'NODE_AUTH_TOKEN', 'REPOCTL_BOOTSTRAP_RUNNING'].includes(key)) {
      delete env[key]
    }
  }
  const cli = path.resolve(import.meta.dirname, '../../bin/repoctl.js')
  const run = (args: string[], overrides: NodeJS.ProcessEnv) => spawnSync(process.execPath, [cli, 'release', 'bootstrap', '--package', '@scope/new', '--version', '1.0.0-alpha.0', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...env, ...overrides },
  })
  return { cwd, run }
}

it.each(['ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'NODE_AUTH_TOKEN', 'NPM_TOKEN', 'REPOCTL_BOOTSTRAP_RUNNING'])('rejects built CLI preparation with %s before evaluating candidate configuration', async (key) => {
  const h = await fixture()
  const result = h.run(['--stage', 'prepare', '--dry-run'], { [key]: 'unexpected' })
  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr).toBe(1)
  expect(result.stderr).toContain(key === 'REPOCTL_BOOTSTRAP_RUNNING' ? 'cannot run recursively' : 'without OIDC or npm publishing credentials')
  expect(existsSync(path.join(h.cwd, 'CONFIG_EXECUTED'))).toBe(false)
})

it.each(['publish', 'verify'])('rejects an invalid GitHub context for built CLI %s without evaluating candidate configuration', async (stage) => {
  const h = await fixture()
  const output = path.join(h.cwd, 'evidence')
  const result = h.run(['--stage', stage, '--output', output], { GITHUB_ACTIONS: 'false', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'unexpected' })
  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr).toBe(1)
  expect(result.stderr).toContain('Bootstrap publication requires GitHub Actions')
  expect(existsSync(path.join(h.cwd, 'CONFIG_EXECUTED'))).toBe(false)
  expect(existsSync(output)).toBe(false)
})
