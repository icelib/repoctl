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

  it('uses trusted changeset scripts and reserves App credentials for same-repository writes', async () => {
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
