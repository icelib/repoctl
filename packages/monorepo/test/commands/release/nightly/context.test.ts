import type { NightlyOptions } from '@icebreakers/monorepo'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { nightlyContext } from '../../../../src/commands/release/nightly/context'

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))))

async function fixture() {
  const cwd = await mkdtemp(path.join(tmpdir(), 'repoctl-nightly-context-'))
  roots.push(cwd)
  const event = { repository: { full_name: 'example/project', default_branch: 'develop' }, inputs: { mode: 'nightly' }, schedule: '0 4 * * *' }
  const env = { CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'example/project', GITHUB_SHA: 'a'.repeat(40), GITHUB_REF: 'refs/heads/develop', GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '1', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_EVENT_PATH: path.join(cwd, 'event.json') }
  await writeFile(env.GITHUB_EVENT_PATH, JSON.stringify(event))
  const options: NightlyOptions = { cwd, env }
  return { options, env, event }
}

it('uses each repository default branch and accepts custom workflows without generated markers', async () => {
  const h = await fixture()
  expect(await nightlyContext(h.options, { provider: 'npm' })).toMatchObject({ repository: 'example/project', branch: 'develop', buildId: '42-1', identity: { commit: 'a'.repeat(40) } })
})

it.each([
  { CI: 'false' },
  { GITHUB_ACTIONS: 'false' },
  { GITHUB_REPOSITORY: '../project' },
  { GITHUB_SHA: 'abc' },
  { GITHUB_SHA: 'A'.repeat(40) },
  { GITHUB_RUN_ID: '0' },
  { GITHUB_RUN_ATTEMPT: '-1' },
  { GITHUB_EVENT_NAME: 'pull_request_target' },
  { GITHUB_REF: 'refs/heads/feature' },
])('rejects incomplete or unauthorized Actions identity: %j', async (changes) => {
  const h = await fixture()
  await expect(nightlyContext({ ...h.options, env: { ...h.env, ...changes } }, { provider: 'npm' })).rejects.toThrow(/requires/)
})

it('binds repository and dispatch mode to the event payload', async () => {
  const h = await fixture()
  await writeFile(h.env.GITHUB_EVENT_PATH, JSON.stringify({ ...h.event, repository: { ...h.event.repository, full_name: 'other/project' } }))
  await expect(nightlyContext(h.options, { provider: 'npm' })).rejects.toThrow('default branch')
  await writeFile(h.env.GITHUB_EVENT_PATH, JSON.stringify({ ...h.event, inputs: { mode: 'oidc-audit' } }))
  await expect(nightlyContext(h.options, { provider: 'npm' })).rejects.toThrow('nightly workflow dispatch')
})

it('requires generated markers to match both provider and configured schedule', async () => {
  const h = await fixture()
  await expect(nightlyContext({ ...h.options, env: { ...h.env, REPOCTL_NIGHTLY_SCHEDULE: '0 4 * * *' } }, { provider: 'npm' })).rejects.toThrow('synchronize the workflow')
  await expect(nightlyContext({ ...h.options, env: { ...h.env, REPOCTL_NIGHTLY_PROVIDER: 'npm' } }, { provider: 'pkg-pr-new' })).rejects.toThrow('synchronize the workflow')
})
