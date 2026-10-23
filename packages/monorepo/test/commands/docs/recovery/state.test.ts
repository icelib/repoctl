import { deployDocs, planDocsDeployment } from '@icebreakers/monorepo'
import { afterEach, expect, it } from 'vitest'
import { cleanup, commit, fixture, put } from '../helpers'
import { loseUpload, runner } from './helpers'

afterEach(cleanup)

it.each([
  ['array deploying phase', (pending: Record<string, unknown>) => { pending['phase'] = ['deploying'] }],
  ['array verifying phase without receipt', (pending: Record<string, unknown>) => { pending['phase'] = ['verifying'] }],
  ['missing snapshot', (pending: Record<string, unknown>) => { delete pending['snapshot'] }],
  ['malformed snapshot', (pending: Record<string, unknown>) => { pending['snapshot'] = null }],
  ['wrong identity', (pending: Record<string, unknown>) => { pending['deploymentId'] = 'b'.repeat(64) }],
  ['wrong source', (pending: Record<string, unknown>) => { (pending['snapshot'] as Record<string, unknown>)['sourceSha'] = 'b'.repeat(40) }],
  ['wrong tree', (pending: Record<string, unknown>) => { (pending['snapshot'] as Record<string, unknown>)['treeSha'] = 'b'.repeat(40) }],
  ['wrong corrections', (pending: Record<string, unknown>) => { (pending['snapshot'] as Record<string, unknown>)['commits'] = ['b'.repeat(40)] }],
  ['invalid requested corrections', (pending: Record<string, unknown>) => { (pending['snapshot'] as Record<string, unknown>)['requestedCommits'] = [null] }],
  ['invalid configuration', (pending: Record<string, unknown>) => { (pending['snapshot'] as Record<string, unknown>)['config'] = {} }],
  ['modified configuration', (pending: Record<string, unknown>) => {
    const config = (pending['snapshot'] as Record<string, unknown>)['config'] as Record<string, unknown>
    config['buildScript'] = 'changed:build'
  }],
])('fails closed before side effects for a %s in stable state', async (_label, corrupt) => {
  const { options, store } = await fixture()
  await loseUpload(options)
  const checkpoint = store.records.get('docs/website/stable')!
  corrupt((checkpoint.value as Record<string, unknown>)['pending'] as Record<string, unknown>)
  const saved = structuredClone(checkpoint)
  const writes = store.writes.length
  await expect(planDocsDeployment(options)).rejects.toThrow()
  const retry = runner()
  await expect(deployDocs({ ...options, spawn: retry.spawn })).rejects.toThrow()
  expect(retry.calls).toEqual([])
  expect(store.writes).toHaveLength(writes)
  expect(store.records.get('docs/website/stable')).toEqual(saved)
})

it('rechecks requested corrections against the frozen tree instead of trusting a saved patch list', async () => {
  const { cwd, options, store } = await fixture()
  await put(cwd, 'website/first.md', '# First\n')
  const first = commit(cwd)
  await loseUpload({ ...options, commits: [first] })
  await put(cwd, 'website/second.md', '# Second\n')
  const second = commit(cwd)
  const checkpoint = store.records.get('docs/website/stable')!.value as {
    pending: { snapshot: { requestedCommits: string[] } }
  }
  checkpoint.pending.snapshot.requestedCommits = [second]
  const retry = runner()
  await expect(deployDocs({ ...options, commits: [second], spawn: retry.spawn })).rejects.toMatchObject({ report: { failedStage: 'plan' } })
  expect(retry.calls).toEqual([])
})
