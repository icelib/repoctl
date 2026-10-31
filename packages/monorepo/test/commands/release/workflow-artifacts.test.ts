import { getAutoChangesetWorkflow, getSnapshotWorkflows } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { parse } from 'yaml'

const artifactActions = {
  'actions/upload-artifact': 'cf430e030ddbb5b0abf93d22962f4752f3646cd9',
  'actions/download-artifact': '9000827ccba6bdab643e8b6fd33ac0654aef8333',
}

it('exports release workflows with the reviewed stable artifact actions and preserves immutable artifact handoffs', async () => {
  const snapshot = await getSnapshotWorkflows()
  const workflows = { ...snapshot, autoChangeset: await getAutoChangesetWorkflow() }
  const counts = { build: 3, publish: 4, autoChangeset: 2 }
  for (const [name, content] of Object.entries(workflows)) {
    const workflow = parse(content) as { jobs: Record<string, { steps: Array<{ uses?: string, with?: Record<string, unknown> }> }> }
    const actions = Object.values(workflow.jobs).flatMap(job => job.steps).filter(step => step.uses && Object.keys(artifactActions).some(action => step.uses!.startsWith(`${action}@`)))
    expect(actions, name).toHaveLength(counts[name as keyof typeof counts])
    for (const step of actions) {
      const action = step.uses!.split('@')[0] as keyof typeof artifactActions
      expect(step.uses, name).toBe(`${action}@${artifactActions[action]}`)
      if (action === 'actions/download-artifact') {
        expect(step.with?.['artifact-ids'], name).toMatch(/needs\..*\.outputs\./u)
        expect(step.with, name).not.toHaveProperty('name')
      }
    }
  }
})
