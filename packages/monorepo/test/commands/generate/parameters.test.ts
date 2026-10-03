import { readFile, symlink } from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Exercise the delivered parameter, move and generator APIs together.
import { applyGeneratePlan, applyWorkspaceMovePlan, checkTemplateDrift, createNewProject, listTemplateInstances, planGenerate, planWorkspaceMove } from '../../../dist/index.mjs'
import { commit, git } from '../removal/fixture'
import { contents, fixture, write } from '../template-parameters/fixtures'
import { sourceRoot } from './fixtures'

it('generates inside a moved parameterized package without changing either instance or secret exclusions', async (t) => {
  const f = await fixture(t)
  await write(f.source, 'sample/package.json', JSON.stringify({ name: 'source', version: '1.0.0', dependencies: { react: '*' } }))
  await createNewProject(f.options)
  const [original] = await listTemplateInstances(f.cwd)
  await git(f.cwd, ['init'])
  await commit(f.cwd)
  const move = await planWorkspaceMove(f.cwd, { target: `./${f.options.name}`, to: 'modules/moved', name: 'moved-sample' })
  expect(move.canApply, JSON.stringify(move.blockers)).toBe(true)
  await applyWorkspaceMovePlan(f.cwd, move)
  await createNewProject({ ...f.options, parameters: { ...f.options.parameters, label: 'second', token: 'second-private-token' } })
  await symlink(path.join(sourceRoot, 'node_modules'), path.join(f.cwd, 'node_modules'), 'junction')
  const records = (await listTemplateInstances(f.cwd)).map(record => record.instance)
  expect(new Set(records.map(record => record.id)).size).toBe(2)
  const moved = records.find(record => record.id === original!.instance.id)!
  expect(moved.target).toBe('modules/moved')
  expect(records.every(record => record.excludedPaths?.includes('credentials.local'))).toBe(true)
  const metadata = await contents(path.join(f.cwd, '.repoctl'))
  const second = await contents(f.target)

  const options = { cwd: f.cwd, package: 'moved-sample', generator: 'react-component' as const, parameters: { name: 'action-button', export: true } }
  const plan = await planGenerate(options)
  expect(plan.files).toHaveLength(3)
  expect(JSON.stringify(plan)).not.toContain('secret-value-734')
  const result = await applyGeneratePlan(plan)
  expect(result.changed).toHaveLength(3)
  expect(result.recoveryFiles).toEqual([])
  expect((await applyGeneratePlan(await planGenerate(options))).changed).toEqual([])
  const target = path.join(f.cwd, moved.target)
  const barrel = await readFile(path.join(target, 'src/index.ts'), 'utf8')
  expect(barrel).toContain('export const label = "hello"')
  expect(barrel).toContain('ActionButton')
  expect(await readFile(path.join(target, 'src/components/action-button.tsx'), 'utf8')).toContain('export function ActionButton')
  expect(await readFile(path.join(target, 'credentials.local'), 'utf8')).toBe('TOKEN=secret-value-734\n')
  expect(await contents(f.target)).toEqual(second)
  expect(await contents(path.join(f.cwd, '.repoctl'))).toEqual(metadata)
  expect((await listTemplateInstances(f.cwd)).map(record => record.instance)).toEqual(records)
  const drift = await checkTemplateDrift(f.cwd)
  const owner = drift.owners.find(record => record.id === moved.id)!
  expect(owner.files).toContainEqual(expect.objectContaining({ path: `${moved.target}/credentials.local`, state: 'excluded' }))
  expect(owner.files).toContainEqual(expect.objectContaining({ path: `${moved.target}/src/index.ts`, state: 'modified' }))
})
