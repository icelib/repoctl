import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it } from 'vitest'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  const cwd = await mkdtemp(path.join(tmpdir(), 'snapshot-cli-'))
  directories.push(cwd)
  await writeFile(path.join(cwd, 'package.json'), '{"name":"snapshot-cli-fixture","private":true}\n')
  await writeFile(path.join(cwd, 'repoctl.config.mjs'), 'import { writeFileSync } from "node:fs"; writeFileSync(new URL("./CONFIG_EXECUTED", import.meta.url), "bad"); throw new Error("candidate config must not run")')
  const cli = path.resolve(import.meta.dirname, '../../../../../bin/repo.js')
  const run = (args: string[]) => spawnSync(process.execPath, [cli, 'release', 'snapshot', ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } })
  return { cwd, run }
}

it('exports both workflows from the built CLI without loading candidate configuration and supports preview and replay', async () => {
  const h = await fixture()
  const preview = h.run(['workflow', '--out', '.github/workflows', '--dry-run', '--json'])
  expect(preview.status, preview.stderr).toBe(0)
  expect(JSON.parse(preview.stdout)).toMatchObject({ dryRun: true, files: [{ status: 'created' }, { status: 'created' }] })
  expect(existsSync(path.join(h.cwd, '.github'))).toBe(false)
  const applied = h.run(['workflow', '--out', '.github/workflows', '--json'])
  expect(applied.status, applied.stderr).toBe(0)
  expect(JSON.parse(applied.stdout).files).toHaveLength(2)
  const replay = h.run(['workflow', '--out', '.github/workflows', '--json'])
  expect(replay.status, replay.stderr).toBe(0)
  expect(JSON.parse(replay.stdout).files.map((file: { status: string }) => file.status)).toEqual(['identical', 'identical'])
  expect(existsSync(path.join(h.cwd, 'CONFIG_EXECUTED'))).toBe(false)
})

it('preflights both workflow destinations and preserves an existing publisher before writing a builder', async () => {
  const h = await fixture()
  const directory = path.join(h.cwd, '.github/workflows')
  await mkdir(directory, { recursive: true })
  const publisher = path.join(directory, 'repoctl-snapshot-publish.yml')
  await writeFile(publisher, 'existing publisher\n')
  const result = h.run(['workflow', '--out', directory])
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('already exists with different content')
  expect(await readFile(publisher, 'utf8')).toBe('existing publisher\n')
  expect(existsSync(path.join(directory, 'repoctl-snapshot-build.yml'))).toBe(false)
  expect(existsSync(path.join(h.cwd, 'CONFIG_EXECUTED'))).toBe(false)
})

it('exposes the prepared artifact commands without requiring legacy identity options', async () => {
  const h = await fixture()
  for (const command of ['source', 'freeze', 'prepare', 'seal', 'verify', 'publish-prepared', 'verify-consumer', 'workflow']) {
    const result = h.run([command, '--help'])
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`snapshot ${command}`)
  }
  const invalid = h.run(['verify', '--run-id', '-1', '--run-attempt', '1', '--builder-sha256', 'a'.repeat(64), '--repository', 'acme/repo'])
  expect(invalid.status).toBe(1)
  expect(invalid.stderr).toContain('Builder run ID must be a positive safe integer')
  expect(existsSync(path.join(h.cwd, 'CONFIG_EXECUTED'))).toBe(false)
})
