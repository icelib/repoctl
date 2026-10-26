import { createHash } from 'node:crypto'
import { getSnapshotWorkflows } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { parse } from 'yaml'

it('binds the trusted publisher policy to the exact exported builder and pins tools independently of candidate code', async () => {
  const workflows = await getSnapshotWorkflows()
  const build = parse(workflows.build)
  const publish = parse(workflows.publish)
  expect(publish.env.SNAPSHOT_BUILDER_SHA256).toBe(createHash('sha256').update(workflows.build).digest('hex'))
  expect(workflows.build + workflows.publish).not.toContain('__VERSION__')
  expect(workflows.build + workflows.publish).not.toContain('__PNPM_VERSION__')
  expect(build.on).toHaveProperty('workflow_dispatch')
  expect(publish.on.workflow_run).toEqual({ workflows: ['repoctl PR snapshot build'], types: ['completed'] })
  expect(build.jobs.freeze.environment).toBe('pr-snapshot')
  expect(build.jobs.freeze.if).toContain('github.event.repository.default_branch')
  for (const job of [...Object.values(build.jobs), ...Object.values(publish.jobs)] as Array<{ steps: Array<{ run?: string, uses?: string }> }>) {
    for (const step of job.steps.filter(step => step.run?.includes('npm install'))) {
      expect(step.run).toContain('--prefix "$RUNNER_TEMP/repoctl-tools"')
      expect(step.run).toContain('--ignore-scripts')
      expect(step.run).toMatch(/repoctl@\d+\.\d+\.\d+/)
      expect(step.run).not.toContain('repoctl@latest')
    }
    for (const step of job.steps.filter(step => step.uses)) {
      expect(step.uses).toMatch(/@[a-f0-9]{40}$/)
    }
  }
})

it('pins an explicitly selected workspace pnpm version and rejects executable or floating tool references', async () => {
  const workflows = await getSnapshotWorkflows({ pnpmVersion: '12.8.1' })
  expect(workflows.build).toContain('pnpm@12.8.1')
  expect(workflows.publish).toContain('pnpm@12.8.1')
  for (const pnpmVersion of ['latest', '^12.14.0', '12.14.0; echo injected', 'https://example.test/pnpm.tgz', '11.0.0']) {
    await expect(getSnapshotWorkflows({ pnpmVersion })).rejects.toThrow('exact trusted pnpm 12')
  }
})

it('separates protected planning, candidate execution, OIDC publication and consumer execution', async () => {
  const workflows = await getSnapshotWorkflows()
  const build = parse(workflows.build)
  const publish = parse(workflows.publish)
  expect(build.jobs.freeze.name).toBe('Freeze snapshot plan')
  expect(build.jobs.build.name).toBe('Build snapshot packages')
  expect(build.jobs.build.needs).toBe('freeze')
  expect(build.jobs.build.permissions).toEqual({ contents: 'read' })
  expect(workflows.build).not.toContain('id-token: write')
  const freezeCommands = build.jobs.freeze.steps.map((step: { run?: string }) => step.run ?? '').join('\n')
  expect(freezeCommands).toContain('release snapshot freeze')
  expect(freezeCommands).toContain('release snapshot seal')
  expect(freezeCommands).not.toContain('release snapshot prepare')
  expect(build.jobs.freeze.steps.findIndex((step: { id?: string }) => step.id === 'artifact')).toBeLessThan(build.jobs.freeze.steps.length - 1)
  expect(publish.jobs.publish.needs).toBe('verify')
  expect(publish.jobs.publish.permissions['id-token']).toBe('write')
  expect(publish.jobs.publish.concurrency).toMatchObject({ 'cancel-in-progress': false })
  expect(publish.jobs.publish.concurrency.group).toContain('needs.verify.outputs.pull_request')
  const publishing = JSON.stringify(publish.jobs.publish)
  expect(publishing).not.toMatch(/checkout|snapshot prepare|snapshot verify-consumer|node_modules\/\.bin\/pnpm exec/)
  expect(publishing).toContain('release snapshot publish-prepared')
  expect(publishing).toContain('--artifact-id')
  expect(publish.jobs.consumer.permissions).toEqual({ contents: 'read' })
  expect(publish.jobs.report.permissions['id-token']).toBeUndefined()
  expect(publish.jobs.report.permissions['pull-requests']).toBe('write')
  const reporting = JSON.stringify(publish.jobs.report)
  expect(reporting).toContain('needs.publish.outputs.report_artifact')
  expect(reporting).toContain('needs.consumer.result')
  expect(reporting).not.toContain('snapshot-consumer.json')
  expect(workflows.publish).not.toMatch(/GITHUB_EVENT_NAME:|GITHUB_SHA:|ACTIONS_ID_TOKEN_REQUEST_TOKEN:/)
})
