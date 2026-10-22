import { expect, it } from 'vitest'
import YAML from 'yaml'
import { sanitizePublishedReleaseWorkflowContent } from './release'

it('preserves consumer release phases while removing source approval dispatch and Actions write permission', () => {
  const content = `# repoctl-managed: release/v2
name: Release
on: [push]
permissions:
  contents: write
  pull-requests: write
  id-token: write
  actions: write
jobs:
  release:
    steps:
      - name: Build Release Tooling
        run: pnpm run tooling:build
      - id: release-prepare
        run: pnpm exec repo release ci --stage prepare
      - id: pr-ci-approval
        env:
          GITHUB_TOKEN: token
        run: node .github/pr-ci/index.mjs release
      - id: release-upload
        run: pnpm exec repo release ci --stage upload
`
  const output = sanitizePublishedReleaseWorkflowContent(content)
  const workflow = YAML.parse(output)
  expect(output).toContain('# repoctl-managed: release/v2')
  expect(workflow.on).toEqual(['push'])
  expect(workflow.permissions).toEqual({ 'contents': 'write', 'pull-requests': 'write', 'id-token': 'write' })
  expect(workflow.jobs.release.steps).toEqual([
    { id: 'release-prepare', run: 'pnpm exec repo release ci --stage prepare' },
    { id: 'release-upload', run: 'pnpm exec repo release ci --stage upload' },
  ])
  expect(output).not.toContain('pr-ci')
  expect(sanitizePublishedReleaseWorkflowContent(output)).toBe(output)
})

it('preserves existing consumer release definitions and rejects invalid YAML', () => {
  const content = 'on: [push]\npermissions:\n  contents: write\njobs: {}\n'
  expect(sanitizePublishedReleaseWorkflowContent(content)).toBe(content)
  expect(() => sanitizePublishedReleaseWorkflowContent('jobs: [')).toThrow('invalid release workflow')
})

function nightlyWorkflow() {
  return {
    on: {
      push: { branches: ['main', 'alpha', 'beta', 'rc', 'next'] },
      schedule: [{ cron: '17 19 * * *' }],
      workflow_dispatch: { inputs: {
        mode: { type: 'choice', default: 'auto', options: ['auto', 'prepare', 'publish', 'publish-unpublished', 'reconcile', 'oidc-audit', 'nightly'] },
        package: { type: 'string', required: false },
      } },
    },
    jobs: {
      'release': {
        if: '$' + '{{ github.event_name != \'schedule\' && inputs.mode != \'nightly\' && inputs.mode != \'oidc-audit\' }}',
        steps: ['plan', 'verify', 'prepare', 'upload', 'confirm', 'finalize'].map(stage => ({ run: `pnpm exec repo release ci --stage ${stage}` })),
      },
      'oidc-audit': { if: '$' + '{{ github.event_name == \'workflow_dispatch\' && inputs.mode == \'oidc-audit\' }}', steps: [{ run: 'pnpm exec repo release ci --mode oidc-audit' }] },
      'nightly': { env: { REPOCTL_NIGHTLY_PROVIDER: 'npm', REPOCTL_NIGHTLY_SCHEDULE: '17 19 * * *' }, steps: [{ run: 'pnpm exec repo release nightly --publish --json' }] },
    },
  }
}

it('keeps manual nightly while removing only source scheduling', () => {
  const source = nightlyWorkflow()
  const output = sanitizePublishedReleaseWorkflowContent(YAML.stringify(source))
  const workflow = YAML.parse(output)
  expect(workflow.on.push).toEqual(source.on.push)
  expect(workflow.on.schedule).toBeUndefined()
  expect(workflow.on.workflow_dispatch.inputs).toEqual(source.on.workflow_dispatch.inputs)
  expect(workflow.jobs.release).toEqual(source.jobs.release)
  expect(workflow.jobs['oidc-audit']).toEqual(source.jobs['oidc-audit'])
  expect(workflow.jobs.nightly.steps).toEqual(source.jobs.nightly.steps)
  expect(workflow.jobs.nightly.env).toEqual({ REPOCTL_NIGHTLY_PROVIDER: 'npm', REPOCTL_NIGHTLY_SCHEDULE: '' })
  expect(workflow.jobs.nightly.if).toBe('$' + '{{ github.event_name == \'workflow_dispatch\' && inputs.mode == \'nightly\' }}')
  expect(output).not.toContain('.github/nightly/')
  expect(sanitizePublishedReleaseWorkflowContent(output)).toBe(output)
})

it('preserves unrelated schedules and custom release conditions when stripping source nightly automation', () => {
  const source = nightlyWorkflow()
  source.on.schedule.push({ cron: '30 8 * * 1' })
  source.jobs.release.if = '$' + '{{ needs.security.result == \'success\' }}'
  const output = sanitizePublishedReleaseWorkflowContent(YAML.stringify(source))
  const workflow = YAML.parse(output)
  expect(workflow.on.schedule).toEqual([{ cron: '30 8 * * 1' }])
  expect(workflow.jobs.release).toEqual(source.jobs.release)
  expect(workflow.jobs.nightly.steps).toEqual(source.jobs.nightly.steps)
  expect(sanitizePublishedReleaseWorkflowContent(output)).toBe(output)
})

it('does not remove a consumer-defined nightly job, dispatch mode or schedule', () => {
  const source = nightlyWorkflow()
  source.jobs.nightly.steps = [{ run: 'node scripts/customer-nightly.mjs' }]
  const content = YAML.stringify(source)
  expect(sanitizePublishedReleaseWorkflowContent(content)).toBe(content)
})

it('does not leak future source schedule or provider changes into consumer defaults', () => {
  const source = nightlyWorkflow()
  source.on.schedule = [{ cron: '3 2 * * *' }]
  source.jobs.nightly.env = { REPOCTL_NIGHTLY_PROVIDER: 'pkg-pr-new', REPOCTL_NIGHTLY_SCHEDULE: '3 2 * * *' }
  const output = sanitizePublishedReleaseWorkflowContent(YAML.stringify(source))
  const workflow = YAML.parse(output)
  expect(workflow.on.schedule).toBeUndefined()
  expect(workflow.jobs.nightly.env).toEqual({ REPOCTL_NIGHTLY_PROVIDER: 'npm', REPOCTL_NIGHTLY_SCHEDULE: '' })
  expect(workflow.jobs.nightly.permissions).toEqual({ 'contents': 'read', 'id-token': 'write' })
  expect(sanitizePublishedReleaseWorkflowContent(output)).toBe(output)
})
