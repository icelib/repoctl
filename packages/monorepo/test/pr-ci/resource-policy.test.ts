import { readFile } from 'node:fs/promises'
import { Script } from 'node:vm'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'

interface Workflow {
  on: { pull_request_target: { types: string[] } }
  concurrency: { 'group': string, 'cancel-in-progress': boolean }
  jobs: Record<string, { 'if'?: string, 'needs'?: string | string[], 'environment'?: string, 'steps'?: unknown[], 'timeout-minutes'?: number }>
}

const workflow = YAML.parse(await readFile(new URL('../../../../.github/workflows/pr-ci.yml', import.meta.url), 'utf8')) as Workflow

// The actual YAML uses comparisons and boolean operators shared by JS and Actions.
// Evaluate those expressions directly so tests cannot pass against a duplicate policy.
function evaluate(expression: string, scope: Record<string, unknown>) {
  return new Script(expression.trim().replace(/^\$\{\{\s*|\s*\}\}$/gu, '')).runInNewContext({
    fromJSON: JSON.parse,
    contains: (values: unknown[], value: unknown) => values.includes(value),
    format: (template: string, ...values: unknown[]) => template.replace(/\{(\d+)\}/gu, (_, index: string) => String(values[Number(index)])),
    ...scope,
  }, { timeout: 100 }) as unknown
}

function event(action = 'opened', options: { number?: number, label?: string, draft?: boolean, state?: string, runId?: number } = {}) {
  return {
    event_name: 'pull_request_target',
    ref: 'refs/heads/main',
    run_id: options.runId ?? 123,
    event: {
      action,
      repository: { default_branch: 'main' },
      pull_request: { number: options.number ?? 42, state: options.state ?? 'open', draft: options.draft ?? false },
      label: { name: options.label ?? '' },
    },
  }
}

function admission(github: ReturnType<typeof event>, inputs = {}) {
  return {
    group: evaluate(workflow.concurrency.group, { github, inputs }),
    approve: evaluate(workflow.jobs['approve']!.if!, { github, inputs }),
  }
}

describe('server-side PR resource admission', () => {
  it.each(['opened', 'synchronize', 'reopened', 'ready_for_review'])('holds %s behind approval in its own PR group', (action) => {
    expect(workflow.on.pull_request_target.types).toContain(action)
    expect(admission(event(action))).toEqual({ group: 'pr-ci-42', approve: true })
    expect(admission(event(action, { draft: true }))).toEqual({ group: 'pr-ci-42', approve: false })
    expect(workflow.jobs['approve']!.environment).toBe('pr-ci')
  })

  it.each(['labeled', 'unlabeled'])('only restarts for release-level labels on %s', (action) => {
    for (const label of ['release:major', 'release:minor']) {
      expect(admission(event(action, { label }))).toEqual({ group: 'pr-ci-42', approve: true })
    }
    for (const label of ['bug', 'documentation', 'release:patch', 'release:major-extra', '']) {
      expect(admission(event(action, { label }))).toEqual({ group: 'pr-ci-ignored-123', approve: false })
      expect(admission(event(action, { label, runId: 456 })).group).toBe('pr-ci-ignored-456')
    }
  })

  it.each([
    { action: 'closed', state: 'closed', draft: false },
    { action: 'closed', state: 'closed', draft: true },
    { action: 'converted_to_draft', state: 'open', draft: true },
  ])('uses $action only to cancel the old run', ({ action, state, draft }) => {
    expect(workflow.on.pull_request_target.types).toContain(action)
    expect(admission(event(action, { state, draft }))).toEqual({ group: 'pr-ci-42', approve: false })
    expect(evaluate(workflow.jobs['report']!.if!, { cancelled: () => false, needs: { prepare: { result: 'skipped' } } })).toBe(false)
  })

  it('shares the cancellation group for default-branch dispatches and isolates other refs', () => {
    const github = { ...event('opened', { number: 0 }), event_name: 'workflow_dispatch' }
    expect(admission(github, { pr_number: '43' })).toEqual({ group: 'pr-ci-43', approve: true })
    for (const ref of ['refs/heads/feature', 'refs/tags/main']) {
      expect(admission({ ...github, ref }, { pr_number: '43' })).toEqual({ group: 'pr-ci-ignored-123', approve: false })
    }
  })

  it('allows selected PRs to run concurrently without a global lock', () => {
    expect(workflow.concurrency['cancel-in-progress']).toBe(true)
    expect(admission(event('opened', { number: 43 }))).toEqual({ group: 'pr-ci-43', approve: true })
    expect(admission(event()).group).not.toBe(admission(event('opened', { number: 43 })).group)
  })

  it('keeps every runner behind the single protected approval', () => {
    const { approve, ...jobs } = workflow.jobs
    expect(approve!.needs).toBeUndefined()
    expect(approve!.steps).toEqual([{ name: 'Approval received', run: 'echo "PR checks approved. Preparing the final commit for validation."' }])
    for (const [name, job] of Object.entries(jobs)) {
      expect(job.environment).toBeUndefined()
      const dependencies = Array.isArray(job.needs) ? job.needs : [job.needs]
      expect(dependencies).toContain(name === 'prepare' ? 'approve' : 'prepare')
      expect(job.if ?? '').not.toContain('always()')
    }
  })
})

describe('cancelled runs stop scheduling reports', () => {
  it.each(['success', 'failure', 'cancelled', 'skipped'])('skips reports after cancellation with prepare=%s', (result) => {
    expect(evaluate(workflow.jobs['report']!.if!, { cancelled: () => true, needs: { prepare: { result } } })).toBe(false)
  })

  it.each(['success', 'failure', 'skipped'])('reports an ordinary %s after successful preparation', (result) => {
    expect(evaluate(workflow.jobs['report']!.if!, { cancelled: () => false, needs: { prepare: { result: 'success' }, build: { result } } })).toBe(true)
    expect(workflow.jobs['report']!['timeout-minutes']).toBe(5)
  })

  it.each(['failure', 'skipped', 'cancelled'])('does not report without a frozen target when prepare=%s', (result) => {
    expect(evaluate(workflow.jobs['report']!.if!, { cancelled: () => false, needs: { prepare: { result } } })).toBe(false)
  })
})
