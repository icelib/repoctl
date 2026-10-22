import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { runInNewContext } from 'node:vm'
import { assetsDir } from '@icebreakers/monorepo-templates'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { rootDir } from '@/constants'
import { checkNightlyWorkflow } from '../../../../../scripts/workflows/nightly.mjs'

async function workflow(root = rootDir) {
  return YAML.parse(await readFile(path.join(root, '.github/workflows/release.yml'), 'utf8'))
}

describe('managed nightly workflow', () => {
  it('enforces the publication and artifact contracts', async () => {
    const source = await workflow()
    expect(() => checkNightlyWorkflow(source)).not.toThrow()
  })

  it.each([
    ['schedule', undefined, '17 19 * * *', ['nightly']],
    ['schedule', undefined, '30 8 * * 1', []],
    ['workflow_dispatch', 'nightly', undefined, ['nightly']],
    ['workflow_dispatch', 'oidc-audit', undefined, ['oidc-audit']],
    ['workflow_dispatch', 'auto', undefined, ['release']],
    ['workflow_dispatch', 'publish', undefined, ['release']],
    ['push', undefined, undefined, ['release']],
  ] as const)('routes %s / %s to only the intended job', async (event, mode, schedule, expected) => {
    const source = await workflow()
    const selected = Object.entries(source.jobs).filter(([, job]) => {
      const expression = (job as { if: string }).if.slice(3, -2).trim()
      // The checked-in expressions use the JavaScript-compatible comparison subset of Actions.
      return runInNewContext(expression, { github: { event_name: event, event: { schedule } }, inputs: { mode } }, { timeout: 1000 })
    }).map(([name]) => name)
    expect(selected).toEqual(expected)
  })

  it.skipIf(process.platform === 'win32').each([
    ['main', 'refs/heads/main', true],
    ['main', 'refs/heads/next', false],
    ['trunk', 'refs/heads/trunk', true],
    ['', 'refs/heads/main', false],
  ])('guards default branch %s and ref %s before checkout', async (defaultBranch, ref, allowed) => {
    const source = await workflow()
    const execute = () => execFileSync('bash', ['-e', '-c', source.jobs.nightly.steps[0].run], {
      env: { ...process.env, DEFAULT_BRANCH: String(defaultBranch), GITHUB_REF: String(ref) },
      stdio: 'pipe',
    })
    if (allowed) {
      expect(execute).not.toThrow()
    }
    else {
      expect(execute).toThrow()
    }
  })

  it('keeps nightly scheduling and source helpers out of consumer release assets', async () => {
    const consumer = await workflow(assetsDir)
    expect(consumer.on.schedule).toBeUndefined()
    expect(consumer.on.workflow_dispatch.inputs.mode.options).toContain('nightly')
    expect(() => checkNightlyWorkflow(consumer, { schedule: '' })).not.toThrow()
    expect(consumer.jobs.release.if).toBe('$' + '{{ github.event_name != \'schedule\' && inputs.mode != \'nightly\' && inputs.mode != \'oidc-audit\' }}')
    expect(JSON.stringify(consumer)).not.toContain('.github/nightly/')
  })

  it.skipIf(process.platform === 'win32').each(['true', 'false', '$(exit 23)'])('passes dry-run as a controlled flag for %s', async (dryRun) => {
    const source = await workflow()
    const command = source.jobs.nightly.steps.find((step: { id?: string }) => step.id === 'nightly-publish').run
    const args = execFileSync('bash', ['-e', '-c', `pnpm() { printf '%s\\n' "$@"; }\n${command}`], {
      env: { ...process.env, REPO_RELEASE_DRY_RUN: dryRun, RUNNER_TEMP: '/tmp/path with spaces' },
      encoding: 'utf8',
    }).trim().split('\n')
    expect(args).toEqual(['exec', 'repo', 'release', 'nightly', '--publish', '--output', '/tmp/path with spaces/repoctl-nightly', '--json', ...(dryRun === 'true' ? ['--dry-run'] : [])])
  })
})
