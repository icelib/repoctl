import { spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { getMaintenanceWorkflow } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import YAML from 'yaml'
import { fixture } from './fixture'

it('retains an actionable report and bootstrap log if installation prevents preparation from running', async () => {
  const h = await fixture()
  const parsed = YAML.parse(await getMaintenanceWorkflow())
  const step = parsed.jobs.prepare.steps.find((step: { id?: string }) => step.id === 'report')
  const code = step.run.split('<<\'NODE\'\n')[1].replace(/\nNODE\n?$/, '')
  const output = path.join(h.root, 'outputs')
  await writeFile(path.join(h.root, 'repoctl-bootstrap.log'), 'ERR_PNPM_OUTDATED_LOCKFILE\n')
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', code], {
    encoding: 'utf8',
    env: { ...process.env, RUNNER_TEMP: h.root, GITHUB_OUTPUT: output, GITHUB_SHA: h.head, BASE_SHA: h.base, GITHUB_REPOSITORY: 'acme/example', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1' },
  })
  expect(result.status, result.stderr).toBe(0)
  const artifact = path.join(h.root, 'repoctl-maintenance')
  const report = JSON.parse(await readFile(path.join(artifact, 'report.json'), 'utf8'))
  expect(report).toMatchObject({ status: 'blocked', head: h.head, base: h.base, patchHash: null })
  expect(report.errors.join()).toContain('bootstrap log')
  expect(await readFile(path.join(artifact, 'check-bootstrap.log'), 'utf8')).toContain('ERR_PNPM_OUTDATED_LOCKFILE')
  expect(await readFile(output, 'utf8')).toBe('status=blocked\n')
})
