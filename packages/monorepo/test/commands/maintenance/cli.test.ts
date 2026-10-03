import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { getMaintenanceWorkflow } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { fixture } from './fixture'

const cli = path.resolve(import.meta.dirname, '../../../../repoctl/bin/repo.js')
function run(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [cli, 'maintenance', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true' },
    timeout: 30_000,
  })
}

it('exports the shipped opt-in workflow and protects an existing file', async () => {
  const h = await fixture()
  const file = path.join(h.root, 'workflow.yml')
  const first = run(h.cwd, ['workflow', '--out', file])
  expect(first.status, first.stderr).toBe(0)
  const bytes = await readFile(file, 'utf8')
  expect(bytes).toBe(await getMaintenanceWorkflow())
  const second = run(h.cwd, ['workflow', '--out', file])
  expect(second.status).toBe(1)
  expect(await readFile(file, 'utf8')).toBe(bytes)
})

it('returns JSON for no-change and blocked preparation with matching exit status', async () => {
  const h = await fixture()
  const unchanged = run(h.cwd, ['upgrade', '--base', h.head, '--head', h.head, '--out', h.options.outputDirectory])
  expect(unchanged.status, unchanged.stderr).toBe(0)
  expect(JSON.parse(unchanged.stdout)).toMatchObject({ status: 'unchanged', plan: null, files: [] })
  const output = path.join(h.root, 'blocked')
  const blocked = run(h.cwd, ['upgrade', '--base', 'invalid-sha', '--out', output])
  expect(blocked.status).toBe(1)
  expect(JSON.parse(blocked.stdout)).toMatchObject({ status: 'blocked', patchHash: null })
  expect(JSON.parse(await readFile(path.join(output, 'report.json'), 'utf8')).errors.join()).toContain('full lowercase commit SHAs')
})
