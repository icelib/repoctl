import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { Script } from 'node:vm'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'

interface Workflow {
  on: { pull_request?: { types: string[] }, pull_request_target?: { types: string[] }, workflow_dispatch?: unknown }
  concurrency: { 'group': string, 'cancel-in-progress': boolean }
  jobs: Record<string, { 'name'?: string, 'if'?: string, 'needs'?: string | string[], 'environment'?: string, 'steps'?: { if?: string, run?: string, env?: Record<string, string> }[], 'with'?: Record<string, string>, 'timeout-minutes'?: number }>
}

const workflow = YAML.parse(await readFile(new URL('../../../../.github/workflows/pr-ci.yml', import.meta.url), 'utf8')) as Workflow
const manual = YAML.parse(await readFile(new URL('../../../../.github/workflows/pr-ci-manual.yml', import.meta.url), 'utf8')) as Workflow

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
    event_name: ['closed', 'converted_to_draft'].includes(action) ? 'pull_request_target' : 'pull_request',
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

function admission(github: ReturnType<typeof event>, inputs = {}, definition = workflow) {
  return {
    group: evaluate(definition.concurrency.group, { github, inputs }),
    approve: evaluate(definition.jobs['approve']!.if!, { github, inputs }),
  }
}

describe('server-side PR resource admission', () => {
  it.each(['opened', 'synchronize', 'reopened', 'ready_for_review'])('holds %s behind approval in its own PR group', (action) => {
    expect(workflow.on.pull_request!.types).toContain(action)
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
    expect(workflow.on.pull_request_target!.types).toContain(action)
    expect(admission(event(action, { state, draft }))).toEqual({ group: 'pr-ci-42', approve: false })
    expect(evaluate(workflow.jobs['report']!.if!, { cancelled: () => false, needs: { approve: { result: 'skipped' }, prepare: { result: 'skipped' } } })).toBe(false)
  })

  it('shares the cancellation group for default-branch dispatches and isolates other refs', () => {
    const github = { ...event('opened', { number: 0 }), event_name: 'workflow_dispatch' }
    expect(admission(github, { pr_number: '43' }, manual)).toEqual({ group: 'pr-ci-43', approve: true })
    expect(admission(event('opened', { number: 43 })).group).toBe(admission(github, { pr_number: '43' }, manual).group)
    for (const ref of ['refs/heads/feature', 'refs/tags/main']) {
      expect(admission({ ...github, ref }, { pr_number: '43' }, manual)).toEqual({ group: 'pr-ci-ignored-123', approve: false })
    }
  })

  it('allows selected PRs to run concurrently without a global lock', () => {
    expect(workflow.concurrency['cancel-in-progress']).toBe(true)
    expect(admission(event('opened', { number: 43 }))).toEqual({ group: 'pr-ci-43', approve: true })
    expect(admission(event()).group).not.toBe(admission(event('opened', { number: 43 })).group)
  })

  it.each([['native', workflow], ['manual', manual]] as const)('keeps every %s runner behind the single protected approval', (_, definition) => {
    const { approve, ...jobs } = definition.jobs
    expect(approve!.needs).toBeUndefined()
    expect(approve!.environment).toBe('pr-ci')
    expect(approve!.steps).toHaveLength(1)
    for (const [name, job] of Object.entries(jobs)) {
      expect(job.environment).toBeUndefined()
      const dependencies = Array.isArray(job.needs) ? job.needs : [job.needs]
      expect(dependencies).toContain(name === 'prepare' ? 'approve' : 'prepare')
      expect(job.if ?? '').not.toContain('always()')
    }
  })

  it('uses the privileged event only for cancellation with every job skipped', () => {
    expect(workflow.on.pull_request_target!.types).toEqual(['closed', 'converted_to_draft'])
    expect(workflow.on.workflow_dispatch).toBeUndefined()
    expect(Object.keys(manual.on)).toEqual(['workflow_dispatch'])
    expect(admission({ ...event(), event_name: 'pull_request_target' }).approve).toBe(false)
  })

  it.each([['native', workflow], ['manual', manual]] as const)('starts no heavy %s jobs before Release Intent succeeds', (_, definition) => {
    expect(definition.jobs['release-intent']!.needs).toBe('prepare')
    for (const name of ['build', 'devcontainer']) {
      const job = definition.jobs[name]!
      expect(job.needs).toEqual(['prepare', 'release-intent'])
      // Without an explicit status function, Actions adds success() to the job's if.
      expect(job.if).not.toMatch(/always\(|cancelled\(|failure\(/u)
    }
  })
})

describe.each([['native', workflow], ['manual', manual]] as const)('cancelled %s runs stop scheduling reports', (_, definition) => {
  it.each(['success', 'failure', 'cancelled', 'skipped'])('skips reports after cancellation with prepare=%s', (result) => {
    expect(evaluate(definition.jobs['report']!.if!, { cancelled: () => true, needs: { approve: { result: 'success' }, prepare: { result } } })).toBe(false)
  })

  it.each(['success', 'failure', 'skipped'])('reports an ordinary %s after successful preparation', (result) => {
    expect(evaluate(definition.jobs['report']!.if!, { cancelled: () => false, needs: { approve: { result: 'success' }, prepare: { result: 'success' }, build: { result } } })).toBe(true)
    expect(definition.jobs['report']!['timeout-minutes']).toBe(5)
  })

  it.each(['failure', 'skipped', 'cancelled'])('does not report without a successful gate: %s', (result) => {
    const needs = { approve: { result }, prepare: { result: 'success' } }
    expect(evaluate(definition.jobs['report']!.if!, { cancelled: () => false, needs })).toBe(false)
  })
})

describe('native required check identity', () => {
  function name(github: ReturnType<typeof event>) {
    return evaluate(workflow.jobs['report']!.name!, { github })
  }

  it.each(['opened', 'synchronize', 'reopened', 'ready_for_review'])('names an applicable %s event PR Validation', (action) => {
    expect(name(event(action))).toBe('PR Validation')
    expect(name(event(action, { draft: true }))).toBe('Ignored PR event')
  })

  it.each(['labeled', 'unlabeled'])('keeps ordinary %s events from publishing a skipped required check', (action) => {
    for (const label of ['release:major', 'release:minor']) {
      expect(name(event(action, { label }))).toBe('PR Validation')
    }
    for (const label of ['bug', 'documentation', 'release:patch', '']) {
      expect(name(event(action, { label }))).toBe('Ignored PR event')
    }
  })

  it.each(['closed', 'converted_to_draft'])('keeps the cancellation-only %s event from replacing native checks', (action) => {
    expect(name(event(action))).toBe('Ignored PR event')
  })
})

describe.each([['native', workflow], ['manual', manual]] as const)('%s incomplete preparation', (_, definition) => {
  it.each(['failure', 'skipped', 'cancelled'])('fails the report after an approved prepare=%s', (result) => {
    const needs = { approve: { result: 'success' }, prepare: { result } }
    const report = definition.jobs['report']!
    expect(evaluate(report.if!, { cancelled: () => false, needs })).toBe(true)
    const failure = report.steps![0]!
    expect(evaluate(failure.if!, { needs })).toBe(true)
    expect(spawnSync('bash', ['-e', '-c', failure.run!], { encoding: 'utf8' }).status).toBe(1)
    expect(evaluate(failure.if!, { needs: { prepare: { result: 'success' } } })).toBe(false)
  })
})

describe('manual preparation rerun approval', () => {
  const preparation = manual.jobs['prepare']!
  const freshness = preparation.steps![0]!

  it.each([
    { approval: '1', current: '2', expected: 1 },
    { approval: '2', current: '2', expected: 0 },
    { approval: '', current: '2', expected: 1 },
  ])('requires current attempt $current to have approval from $approval', ({ approval, current, expected }) => {
    const env = Object.fromEntries(Object.entries(freshness.env!).map(([key, value]) => [key, evaluate(value, {
      needs: { approve: { outputs: { approval_attempt: approval } } },
      github: { run_attempt: current },
    }) as string]))
    expect(spawnSync('bash', ['-e', '-c', freshness.run!], { env: { ...process.env, ...env }, encoding: 'utf8' }).status).toBe(expected)
  })

  it('reuses the frozen successful preparation when only failed matrix jobs are rerun', () => {
    expect(preparation.needs).toBe('approve')
    for (const name of ['build', 'devcontainer']) {
      const job = manual.jobs[name]!
      expect(job.with!['ref']).toBe('$' + '{{ needs.prepare.outputs.merge_sha }}')
      expect(JSON.stringify(job)).not.toContain('approval_attempt')
      expect(JSON.stringify(job)).not.toContain('prepare-manual')
    }
    expect(JSON.stringify(manual.jobs['report'])).not.toContain('approval_attempt')
  })
})
