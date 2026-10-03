import type { TestContext } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { applyTemplateLinkPlan, listTemplateInstances, planTemplateLink } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { contents, fixture, write } from './fixtures'

async function historical(t: TestContext) {
  const f = await fixture(t)
  const sourceDir = path.join(f.root, 'historical')
  await fs.mkdir(path.join(sourceDir, 'templates'), { recursive: true })
  await fs.cp(path.join(f.source, 'sample'), path.join(sourceDir, 'templates/custom'), { recursive: true })
  await write(sourceDir, 'package.json', '{"name":"@icebreakers/monorepo-templates","version":"1.2.3"}\n')
  await write(f.target, 'business.txt', 'preserve business files\n')
  const options = { cwd: f.cwd, target: f.options.name, template: 'custom', version: '1.2.3', sourceDir, profile: 'repo-new-parameters-v1' as const }
  return { ...f, sourceDir, link: options }
}

it('rejects historical secret values before a public plan or baseline can retain them', async (t) => {
  const f = await historical(t)
  const before = await contents(f.cwd)
  const error = await planTemplateLink({ ...f.link, parameters: { templateValues: f.options.parameters } }).catch(error => error)
  expect(error).toBeInstanceOf(Error)
  expect(error.message).toContain('must not contain sensitive values')
  expect(error.message).not.toContain(f.options.parameters.token)
  expect(await contents(f.cwd)).toEqual(before)
})

it('requires a historical contract instead of recording unverified parameter values', async (t) => {
  const f = await historical(t)
  const before = await contents(f.cwd)
  await expect(planTemplateLink({ ...f.link, sourceDir: path.join(f.root, 'unavailable'), version: '98765.0.0', allowUnverified: true, parameters: { templateValues: f.options.parameters } })).rejects.toThrow('requires the exact historical source')
  for (const profile of ['repo-new-v1', 'workspace-copy-v1'] as const) {
    await expect(planTemplateLink({ ...f.link, profile, parameters: { templateValues: { token: f.options.parameters.token } } })).rejects.toThrow('require the parameterized generation profile')
  }
  expect(await contents(f.cwd)).toEqual(before)
})

it('retains verified nonsensitive defaults and makes historical linking idempotent', async (t) => {
  const f = await historical(t)
  await write(f.sourceDir, 'templates/custom/repoctl.template.json', JSON.stringify({ schemaVersion: 1, parameters: { label: { type: 'string', default: 'original default' } }, interpolate: ['src/index.ts'] }))
  const business = await contents(f.target)
  const plan = await planTemplateLink(f.link)
  expect(plan.options.parameters).toMatchObject({ templateValues: { label: 'original default' } })
  await applyTemplateLinkPlan(plan)
  expect(await contents(f.target)).toEqual(business)
  expect((await listTemplateInstances(f.cwd))[0]!.instance.parameters.templateValues).toEqual({ label: 'original default' })
  const registered = await contents(f.cwd)
  const repeated = await planTemplateLink(f.link)
  expect(repeated.action).toBe('unchanged')
  await applyTemplateLinkPlan(repeated)
  expect(await contents(f.cwd)).toEqual(registered)
})
