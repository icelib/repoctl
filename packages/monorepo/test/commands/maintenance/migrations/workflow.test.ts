import { spawnSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { getMaintenanceWorkflow } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import YAML from 'yaml'
import { getMaintenanceMigrationPolicy } from '@/commands/maintenance/migrations'
import { migrationRegistry } from '@/commands/upgrade/migrations/registry'
import { publisherFixture } from './fixture'

it('executes the embedded publisher with the same fixed registry identity and policy', async () => {
  const h = await publisherFixture({ prerelease: true })
  const policy = getMaintenanceMigrationPolicy()
  expect(policy.migrations).toEqual(migrationRegistry.filter(migration => migration.maintenance).map(migration => ({ id: migration.id, version: migration.version, ...migration.maintenance })))
  const workflow = YAML.parse(await getMaintenanceWorkflow())
  const script = workflow.jobs.propose.steps.find((step: {
    id?: string
  }) => step.id === 'verify').with.script
  expect(script).toContain(`migrationPolicy: ${JSON.stringify(policy)}`)
  expect(script).not.toContain('from \'./migrations.mjs\'')
  const routes = ['GET /repos/{owner}/{repo}', 'GET /repos/{owner}/{repo}/branches/{branch}', 'GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}']
  const responses = Object.fromEntries(await Promise.all(routes.map(async route => [route, await h.request(route)])))
  const context = { repo: h.expected.coordinates, sha: h.head, payload: { repository: { default_branch: 'main' } } }
  const runner = path.join(h.root, 'embedded-publisher.mjs')
  await writeFile(runner, `
    const context = ${JSON.stringify(context)};
    const responses = ${JSON.stringify(responses)};
    const github = { request: async route => responses[route] };
    const outputs = {};
    const core = { setOutput: (key, value) => { outputs[key] = value; } };
    ${script}
    console.log(JSON.stringify(outputs));
  `)
  const result = spawnSync(process.execPath, [runner], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_WORKSPACE: h.input.cwd, RUNNER_TEMP: h.root, BASE_SHA: h.base, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', ARTIFACT_ID: '456', ARTIFACT_DIGEST: h.expected.artifactDigest, APP_CONFIGURED: 'true' },
  })
  expect(result.status, result.stderr).toBe(0)
  const outputs = JSON.parse(result.stdout)
  expect(outputs.ready).toBe('true')
  expect(outputs['body-file']).toContain('verified-body.md')
  expect((await h.readLedger()).attempt).toBeNull()
})
