import { readFile } from 'node:fs/promises'
import { assetsDir } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import { expect, it } from 'vitest'
import YAML from 'yaml'
import { rootDir } from '@/constants'

it('routes main pushes exclusively to preview and uses a completed record for automatic stable deployments', async () => {
  const docs = YAML.parse(await readFile(path.join(assetsDir, '.github/workflows/repoctl-docs.yml'), 'utf8'))
  const release = YAML.parse(await readFile(path.join(assetsDir, '.github/workflows/release.yml'), 'utf8'))
  expect(docs.on.push.branches).toEqual(['main'])
  expect(docs.jobs.deploy.with.channel).toContain('github.event_name == \'push\' && \'preview\'')
  expect(release.jobs.docs.needs).toBe('release')
  expect(release.jobs.docs.if).toContain('!cancelled()')
  expect(release.jobs.docs.if).not.toMatch(/\bsuccess\s*\(|needs\.release\.result/)
  expect(release.jobs.docs.if).toContain('needs.release.outputs.release-record != \'\'')
  expect(release.jobs.docs.if).toContain('needs.release.outputs.docs-sites != \'\'')
  expect(release.jobs.docs.if).toContain('needs.release.outputs.docs-sites != \'[]\'')
  expect(release.jobs.docs.with.channel).toBe('stable')
  expect(release.jobs.docs.with.release).toContain('needs.release.outputs.release-record')
  expect(release.jobs.release.outputs['release-record']).toContain('steps.release-finalize.outputs.release-record')
  expect(release.jobs.docs.uses).toBe(docs.jobs.deploy.uses)
  expect(release.on.release).toBeUndefined()
  expect(docs.on.workflow_run).toBeUndefined()
})

it('keeps one serialized deployment entrypoint for automatic, manual and retry requests', async () => {
  const filename = '.github/workflows/repoctl-docs-deploy.yml'
  const source = await readFile(path.join(rootDir, filename), 'utf8')
  expect(await readFile(path.join(assetsDir, filename), 'utf8')).toBe(source)
  const workflow = YAML.parse(source)
  expect(Object.keys(workflow.on)).toEqual(['workflow_call'])
  expect(workflow.concurrency['cancel-in-progress']).toBe(false)
  expect(workflow.jobs.deploy.if).toContain('github.ref == \'refs/heads/main\'')
  const deploy = workflow.jobs.deploy.steps.find((step: { run?: string }) => step.run?.includes('repo docs deploy'))
  expect(deploy.env.REPO_DOCS_CONCURRENCY_GROUP).toBe(workflow.concurrency.group)
  expect(deploy.run).toContain('repo docs plan')
  expect(deploy.run).not.toMatch(/\$\{\{ inputs\./)
  expect(workflow.jobs.deploy.steps.find((step: { uses?: string }) => step.uses?.startsWith('actions/checkout@')).with['fetch-depth']).toBe(0)
})
