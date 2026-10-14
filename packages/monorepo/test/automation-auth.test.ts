import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { assetsDir } from '@icebreakers/monorepo-templates'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { rootDir } from '@/constants'

interface Step {
  'name'?: string
  'id'?: string
  'if'?: string
  'uses'?: string
  'run'?: string
  'env'?: Record<string, string>
  'with'?: Record<string, unknown>
  'continue-on-error'?: boolean
}

function expression(body: string) {
  return '$' + `{{ ${body} }}`
}

async function readSteps(root: string, workflow: string, job: string): Promise<Step[]> {
  const content = await readFile(`${root}/.github/workflows/${workflow}.yml`, 'utf8')
  return YAML.parse(content).jobs[job].steps
}

async function readWorkflow(root: string, workflow: string) {
  return YAML.parse(await readFile(`${root}/.github/workflows/${workflow}.yml`, 'utf8'))
}

const workflows = [
  { workflow: 'release', job: 'release' },
  { workflow: 'release-intent-auto', job: 'generate' },
]

describe.each([rootDir, assetsDir])('automation authentication in %s', (root) => {
  it.each(workflows)('rejects partial App configuration in $workflow', async ({ workflow, job }) => {
    const steps = await readSteps(root, workflow, job)
    const validation = steps.find(step => step.name === 'Validate GitHub App configuration')!
    for (const [clientId, keyConfigured, expectedStatus] of [
      ['', 'false', 0],
      ['client-id', 'true', 0],
      ['', 'true', 1],
      ['client-id', 'false', 1],
    ] as const) {
      const result = spawnSync('bash', ['-e', '-c', validation.run!], {
        encoding: 'utf8',
        env: { ...process.env, APP_CLIENT_ID: clientId, APP_PRIVATE_KEY_CONFIGURED: keyConfigured },
      })
      expect(result.error).toBeUndefined()
      expect(result.status, result.stderr).toBe(expectedStatus)
      if (expectedStatus !== 0) {
        expect(result.stderr).toContain('Configure both REPOCTL_APP_CLIENT_ID and REPOCTL_APP_PRIVATE_KEY')
      }
    }
  })

  it.each(workflows)('scopes and revokes App tokens without suppressing failures in $workflow', async ({ workflow, job }) => {
    const steps = await readSteps(root, workflow, job)
    const token = steps.find(step => step.id === 'app-token')!
    expect(token.uses).toMatch(/^actions\/create-github-app-token@[0-9a-f]{40}$/)
    expect(token.with).toEqual({
      'client-id': expression('vars.REPOCTL_APP_CLIENT_ID'),
      'private-key': expression('secrets.REPOCTL_APP_PRIVATE_KEY'),
      'permission-contents': 'write',
      'permission-pull-requests': 'write',
    })
    expect(token['continue-on-error']).not.toBe(true)
  })

  it('authenticates release pushes and API requests with the same credential', async () => {
    const steps = await readSteps(root, 'release', 'release')
    const checkout = steps.find(step => step.uses?.startsWith('actions/checkout@'))!
    const runners = steps.filter(step => step.run?.startsWith('pnpm exec repo release ci --stage '))
    expect(runners).toHaveLength(6)
    const credential = expression('steps.app-token.outputs.token || secrets.REPOCTL_RELEASE_TOKEN || secrets.CHANGESETS_RELEASE_TOKEN || github.token')
    expect(checkout.with?.['token']).toBe(credential)
    expect(checkout.with?.['persist-credentials']).not.toBe(false)
    for (const runner of runners) {
      expect(runner.env?.['GITHUB_TOKEN']).toBe(credential)
    }
    expect(steps.findIndex(step => step.id === 'app-token')).toBeLessThan(steps.indexOf(checkout))
  })

  it('uses App credentials for trusted release-intent automation', async () => {
    const steps = await readSteps(root, 'release-intent-auto', 'generate')
    const checkout = steps.find(step => step.uses?.startsWith('actions/checkout@'))!
    const token = steps.find(step => step.id === 'app-token')!
    const runner = steps.find(step => step.run === 'node .github/auto-changeset/index.mjs')!
    expect(checkout.with?.['ref']).toBe(expression('github.event.pull_request.base.sha || github.sha'))
    expect(checkout.with?.['persist-credentials']).toBe(false)
    expect(token.if).toBe(expression('vars.REPOCTL_APP_CLIENT_ID != \'\' && (github.event_name == \'workflow_dispatch\' || github.event.pull_request.head.repo.full_name == github.repository)'))
    expect(runner.env?.['GITHUB_TOKEN']).toBe(expression('steps.app-token.outputs.token || github.token'))
  })
})

describe('source PR approval authentication', () => {
  it('requests approval for token-created source Release PRs without granting consumers Actions write access', async () => {
    const source = await readWorkflow(rootDir, 'release')
    const consumer = await readWorkflow(assetsDir, 'release')
    const step = source.jobs.release.steps.find((item: Step) => item.id === 'pr-ci-approval')!
    expect(source.permissions.actions).toBe('write')
    expect(step.if).toBe(expression('steps.release-prepare.outcome == \'success\''))
    expect(step.env.GITHUB_TOKEN).toBe(expression('github.token'))
    expect(step.env.RELEASE_USES_EVENT_TOKEN).toBe(expression('steps.app-token.outputs.token == \'\' && secrets.REPOCTL_RELEASE_TOKEN == \'\' && secrets.CHANGESETS_RELEASE_TOKEN == \'\''))
    expect(consumer.permissions.actions).toBeUndefined()
    expect(consumer.jobs.release.steps.some((item: Step) => item.id === 'pr-ci-approval')).toBe(false)
  })

  it('keeps source backfill manual while consumers retain automatic PR changesets', async () => {
    const source = await readWorkflow(rootDir, 'release-intent-auto')
    const consumer = await readWorkflow(assetsDir, 'release-intent-auto')
    expect(Object.keys(source.on)).toEqual(['workflow_dispatch'])
    expect(consumer.on.pull_request_target.types).toEqual(['opened', 'synchronize', 'reopened', 'ready_for_review', 'labeled', 'unlabeled'])
    expect(consumer.on.workflow_dispatch).toBeDefined()
    expect(consumer.jobs.generate.environment).toBeUndefined()
  })

  it('uses built-in credentials and trusted default-branch code only after approval', async () => {
    const workflow = await readWorkflow(rootDir, 'pr-ci')
    expect(workflow.jobs.approve.environment).toBe('pr-ci')
    expect(workflow.jobs.approve.if).toBe(expression('(github.event_name == \'workflow_dispatch\' && github.ref == format(\'refs/heads/{0}\', github.event.repository.default_branch)) || (github.event_name == \'pull_request_target\' && !github.event.pull_request.draft)'))
    expect(workflow.jobs.prepare.needs).toBe('approve')
    expect(workflow.jobs.prepare.permissions).toEqual({ 'contents': 'write', 'pull-requests': 'write', 'statuses': 'write' })
    const steps = await readSteps(rootDir, 'pr-ci', 'prepare')
    const checkout = steps.find(step => step.uses?.startsWith('actions/checkout@'))!
    const runner = steps.find(step => step.run === 'node .github/pr-ci/index.mjs prepare')!
    expect(checkout.with?.['ref']).toBe(expression('github.event_name == \'workflow_dispatch\' && github.event.repository.default_branch || github.sha'))
    expect(checkout.with?.['persist-credentials']).toBe(false)
    expect(steps.some(step => step.uses?.startsWith('actions/create-github-app-token@'))).toBe(false)
    expect(runner.env?.['GITHUB_TOKEN']).toBe(expression('github.token'))
    expect(JSON.stringify(steps)).not.toContain('REPOCTL_APP_PRIVATE_KEY')
  })

  it('gives validators read-only permissions and writes final status with trusted reporting code', async () => {
    const workflow = await readWorkflow(rootDir, 'pr-ci')
    for (const job of ['build', 'devcontainer', 'release-intent']) {
      expect(workflow.jobs[job].permissions).toEqual({ contents: 'read' })
      expect(workflow.jobs[job].needs).toBe('prepare')
      expect(workflow.jobs[job].secrets).not.toBe('inherit')
    }
    expect(workflow.jobs.report.permissions).toEqual({ 'contents': 'read', 'pull-requests': 'read', 'statuses': 'write' })
    const steps = await readSteps(rootDir, 'pr-ci', 'report')
    const checkout = steps.find(step => step.uses?.startsWith('actions/checkout@'))!
    const runner = steps.find(step => step.run === 'node .github/pr-ci/index.mjs report')!
    expect(checkout.with?.['ref']).toBe(expression('github.event_name == \'workflow_dispatch\' && github.event.repository.default_branch || github.sha'))
    expect(checkout.with?.['persist-credentials']).toBe(false)
    expect(runner.env?.['GITHUB_TOKEN']).toBe(expression('github.token'))
    expect(runner.env?.['HEAD_SHA']).toBe(expression('needs.prepare.outputs.head_sha'))
  })
})
