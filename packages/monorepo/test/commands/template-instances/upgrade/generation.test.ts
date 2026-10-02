import fs from 'node:fs/promises'
import path from 'node:path'
import { prepareTemplateInstanceSource, recordGeneratedTemplateInstance } from '@icebreakers/monorepo-templates'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist
import { applyTemplateUpgradePlan, planTemplateUpgrade, rebuildTemplateInstanceBaseline } from '../../../../dist/index.mjs'
import { contents, fixture, write } from '../fixtures'

it('retains original generated package identity and Git metadata when rendering a later version', async (t) => {
  const f = await fixture(t)
  const source = path.join(f.sourceDir, 'templates/tsdown')
  const target = path.join(f.cwd, f.target)
  await fs.rm(target, { recursive: true })
  await fs.cp(source, target, { recursive: true })
  await fs.rename(path.join(target, 'gitignore'), path.join(target, '.gitignore'))
  const metadata = { author: 'Original Author <original@example.com>', bugs: { url: 'https://example.com/old/issues' }, repository: { type: 'git', url: 'https://example.com/old.git', directory: f.target } }
  const generated = { name: '@business/original', version: '0.0.0', ...metadata }
  await write(target, 'package.json', `${JSON.stringify(generated, null, 2)}\n`)
  await recordGeneratedTemplateInstance({ workspaceDir: f.cwd, targetDir: target, template: 'tsdown', preparedSource: await prepareTemplateInstanceSource(source, f.sourceDir), profile: 'repo-new-v1', parameters: { packageName: generated.name, renameJson: false } })
  const nextSource = path.join(f.root, 'next-package')
  await fs.cp(f.sourceDir, nextSource, { recursive: true })
  await write(nextSource, 'package.json', '{"name":"@icebreakers/monorepo-templates","version":"2.0.0"}\n')
  await write(nextSource, 'templates/tsdown/package.json', '{"name":"new-upstream-name","version":"99.0.0","author":"New upstream author","description":"New description"}\n')
  const plan = await planTemplateUpgrade({ cwd: f.cwd, instance: f.target, version: '2.0.0', sourceDir: nextSource })
  expect(plan.action).toBe('upgrade')
  await applyTemplateUpgradePlan(plan)
  expect(JSON.parse(await fs.readFile(path.join(target, 'package.json'), 'utf8'))).toEqual({ ...generated, description: 'New description' })
  const rebuilt = path.join(f.root, 'upgraded-baseline')
  await rebuildTemplateInstanceBaseline(f.cwd, f.target, rebuilt)
  expect(JSON.parse(await fs.readFile(path.join(rebuilt, 'package.json'), 'utf8'))).toEqual({ ...generated, description: 'New description' })
  await write(nextSource, 'package.json', '{"name":"@icebreakers/monorepo-templates","version":"3.0.0"}\n')
  await write(nextSource, 'templates/tsdown/package.json', 'Invalid template manifest')
  const beforeFailure = await contents(f.cwd)
  await expect(planTemplateUpgrade({ cwd: f.cwd, instance: f.target, version: '3.0.0', sourceDir: nextSource })).rejects.toThrow()
  expect(await contents(f.cwd)).toEqual(beforeFailure)
})
