import { deployDocs } from '@icebreakers/monorepo'
import { afterEach, expect, it } from 'vitest'
import { cleanup, expectDocsFailure } from '../helpers'
import { lifecycleFixture } from './fixture'

afterEach(cleanup)

it.each(['preview', 'stable'] as const)('prepares other sites independently before building and deploying the selected %s site', async (channel) => {
  const h = await lifecycleFixture(channel)
  const original = { ...h.options.env }
  const result = await deployDocs(h.options)
  const events = h.events()
  expect(events.map(event => event.stage)).toEqual(['install', 'build', 'deploy'])
  expect(events[0]).toMatchObject({
    context: { channel: 'preview', origin: 'https://preview.companion.invalid' },
    metadata: {},
  })
  expect(events[0]!.metadata).toEqual({})
  const origin = channel === 'preview' ? 'https://next.example.invalid' : 'https://docs.example.invalid'
  for (const event of events.slice(1)) {
    expect(event.context).toMatchObject({ channel, origin })
    expect(event.metadata).toMatchObject({
      REPO_DOCS_SITE: 'website',
      REPO_DOCS_CHANNEL: channel,
      REPO_DOCS_SOURCE_SHA: h.sourceSha,
      REPO_DOCS_TREE_SHA: result.plan.treeSha,
      REPO_DOCS_RELEASE_ID: channel === 'stable' ? h.record.id : '',
      REPO_DOCS_DEPLOYMENT_ID: result.plan.deploymentId,
      REPO_DOCS_URL: origin,
      REPO_DOCS_RESULT_FILE: expect.stringContaining('deployment-result.json'),
    })
  }
  expect(result).toMatchObject({ status: 'deployed', versionId: 'lifecycle-version', url: origin })
  expect(h.options.env).toEqual(original)
  expect(h.store.records.get(`docs/website/${channel}`)!.value).toMatchObject({ current: { sourceSha: h.sourceSha, versionId: 'lifecycle-version' } })
}, 30_000)

it('keeps the selected site URL validation strict after dependency preparation', async () => {
  const h = await lifecycleFixture('preview')
  h.options.config!.sites!['website']!.preview.url = 'https://wrong.invalid'
  await expectDocsFailure(deployDocs(h.options), 'build', 'process-failed')
  expect(h.events().map(event => event.stage)).toEqual(['install'])
  expect(h.store.records.get('docs/website/preview')!.value).not.toHaveProperty('pending')
  expect(h.store.records.get('docs/website/preview')!.value).not.toHaveProperty('current')
}, 30_000)

it.each(['install', 'build'] as const)('does not invoke the provider after a real %s lifecycle failure', async (stage) => {
  const h = await lifecycleFixture('preview')
  const env = { ...h.options.env, DOCS_TEST_FAILURE: stage }
  await expectDocsFailure(deployDocs({ ...h.options, env }), stage, 'process-failed')
  expect(h.events().map(event => event.stage)).toEqual(stage === 'install' ? ['install'] : ['install', 'build'])
  expect(h.store.records.get('docs/website/preview')!.value).not.toHaveProperty('pending')
  expect(h.store.records.get('docs/website/preview')!.value).not.toHaveProperty('current')
}, 30_000)
