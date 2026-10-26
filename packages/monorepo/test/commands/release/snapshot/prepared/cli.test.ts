import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { getSnapshotWorkflows } from '@icebreakers/monorepo'
import { afterEach, expect, it } from 'vitest'
import { githubFixture } from './github/fixture'

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
  const run = (args: string[], env: NodeJS.ProcessEnv = {}, preload?: string) => spawnSync(process.execPath, [...(preload ? ['--import', pathToFileURL(preload).href] : []), cli, 'release', 'snapshot', ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', ...env } })
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

it('exports custom destinations with identical API and CLI policy bytes', async () => {
  const h = await fixture()
  const args = ['workflow', '--out', '.github/workflows', '--environment', 'reviewed', '--builder-workflow', '.github/workflows/pr-build.yml', '--publisher-workflow', '.github/workflows/release.yml', '--builder-name', 'Reviewed packages', '--publisher-name', 'Publish packages']
  const workflows = await getSnapshotWorkflows({ environment: 'reviewed', builderWorkflowPath: '.github/workflows/pr-build.yml', publisherWorkflowPath: '.github/workflows/release.yml', builderWorkflowName: 'Reviewed packages', publisherWorkflowName: 'Publish packages' })
  const result = h.run(args)
  expect(result.status, result.stderr).toBe(0)
  expect(await readFile(path.join(h.cwd, '.github/workflows/pr-build.yml'), 'utf8')).toBe(workflows.build)
  expect(await readFile(path.join(h.cwd, '.github/workflows/release.yml'), 'utf8')).toBe(workflows.publish)
  expect(existsSync(path.join(h.cwd, '.github/workflows/repoctl-snapshot-build.yml'))).toBe(false)
  expect(h.run(args).status).toBe(0)
  const conflicting = h.run([...args, '--environment', 'changed'])
  expect(conflicting.status).toBe(1)
  expect(await readFile(path.join(h.cwd, '.github/workflows/pr-build.yml'), 'utf8')).toBe(workflows.build)
})

it('passes the CLI publisher filename to the trusted identity check before any registry operation', async () => {
  const h = await fixture()
  const github = githubFixture()
  const source = github.prepared.plan.source
  const preload = path.join(h.cwd, 'github-mock.mjs')
  await writeFile(path.join(h.cwd, 'github-data.json'), JSON.stringify({
    repository: source.repository,
    routes: Object.fromEntries(github.routes),
    downloads: Object.fromEntries([...github.downloads].map(([name, bytes]) => [name, Buffer.from(bytes).toString('base64')])),
  }))
  await writeFile(preload, `import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync(new URL('./github-data.json', import.meta.url), 'utf8'));
globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  if (url.hostname !== 'api.github.com') throw new Error('Unexpected registry operation before identity rejection');
  const route = url.pathname.replace('/repos/' + data.repository, '');
  if (data.downloads[route]) return new Response(Buffer.from(data.downloads[route], 'base64'));
  if (Object.hasOwn(data.routes, route)) return Response.json(data.routes[route]);
  throw new Error('Unexpected GitHub request: ' + route);
};\n`)
  const event = path.join(h.cwd, 'event.json')
  await writeFile(event, JSON.stringify({ repository: { id: source.repositoryId, full_name: source.repository }, workflow_run: { id: source.runId, run_attempt: source.runAttempt, conclusion: 'success' } }))
  const result = h.run(['publish-prepared', '--repository', source.repository, '--run-id', String(source.runId), '--run-attempt', String(source.runAttempt), '--builder-workflow', source.workflowPath, '--builder-sha256', github.options.policy.workflowSha256, '--output', 'reports', '--publisher-workflow', '.github/workflows/release.yml', '--json'], {
    GITHUB_ACTIONS: 'true',
    GITHUB_TOKEN: 'fixture-github-token',
    GITHUB_EVENT_NAME: 'workflow_run',
    GITHUB_REPOSITORY: source.repository,
    GITHUB_WORKFLOW_REF: `${source.repository}/.github/workflows/repoctl-snapshot-publish.yml@refs/heads/main`,
    GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_PATH: event,
  }, preload)
  expect(result.status, result.stderr).toBe(1)
  expect(result.stdout, result.stderr).not.toBe('')
  expect(JSON.parse(result.stdout).error).toContain('trusted default-branch workflow_run publisher')
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
