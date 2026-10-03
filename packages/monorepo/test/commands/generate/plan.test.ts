import { execFile } from 'node:child_process'
import { lstat, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist
import { applyGeneratePlan, planGenerate } from '../../../dist/index.mjs'
import { cli, fixture, write } from './fixtures'

it.for([
  ['vue-component', 'vue', 'vue'],
  ['react-component', 'react', 'tsx'],
  ['hono-route', 'server', 'ts'],
] as const)('previews and applies %s with stable bytes and idempotent exports', async ([generator, target, extension], t) => {
  const root = await fixture(t)
  const options = { cwd: root, package: `@fixture/${target}`, generator, parameters: { name: 'hello-world', export: true } }
  const plan = await planGenerate(options)
  expect(plan.files).toHaveLength(3)
  const source = plan.files.find(file => file.path.endsWith(`hello-world.${extension}`))!
  await expect(lstat(path.join(plan.packageDir, source.path))).rejects.toThrow()
  await expect(lstat(path.join(plan.packageDir, '.repoctl'))).rejects.toThrow()
  const result = await applyGeneratePlan(plan)
  expect(result.changed).toHaveLength(3)
  for (const file of plan.files) {
    expect(await readFile(path.join(plan.packageDir, file.path), 'utf8')).toBe(file.after)
  }
  const next = await planGenerate(options)
  expect(next.files.every(file => file.action === 'unchanged')).toBe(true)
  expect((await applyGeneratePlan(next)).changed).toEqual([])
  const barrel = await readFile(path.join(plan.packageDir, 'src/index.ts'), 'utf8')
  expect(barrel).toContain('// Existing business exports.')
  expect(barrel.match(/from ['"]\.\/(?:components|routes)\/hello-world/g)).toHaveLength(1)
  if (generator === 'hono-route') {
    expect(plan.nextSteps.join('\n')).toContain('app.route(\'/hello-world\', helloWorldRoute)')
  }
})

it('validates typed parameters, package selection and framework before creating files', async (t) => {
  const root = await fixture(t)
  const options = { cwd: root, package: '@fixture/vue', generator: 'react-component' as const, parameters: { name: 'card' } }
  await expect(planGenerate(options)).rejects.toThrow('declare react')
  await expect(planGenerate({ ...options, package: 'missing' })).rejects.toThrow('found 0')
  await expect(planGenerate({ ...options, parameters: { name: '../escape' } })).rejects.toThrow('kebab-case')
  await expect(planGenerate({ ...options, parameters: { name: 'card', export: 'false' } })).rejects.toThrow()
  await expect(planGenerate({ ...options, parameters: { name: 'card', typo: true } })).rejects.toThrow()
  expect(await readdir(path.join(root, 'packages/vue/src'))).toEqual(['index.ts'])
})

it('refuses conflicting source content and existing exported symbols', async (t) => {
  const root = await fixture(t)
  const options = { cwd: root, package: 'packages/react', generator: 'react-component' as const, parameters: { name: 'card', export: true } }
  await write(root, 'packages/react/src/components/card.tsx', 'business code\n')
  await expect(planGenerate(options)).rejects.toThrow('Generator file conflict')
  await write(root, 'packages/react/src/index.ts', 'export { Card } from \'./another-component\'\n')
  await expect(planGenerate(options)).rejects.toThrow('Export name already exists')
})

it('CLI JSON stays read-only and new continues rejecting existing package directories', async (t) => {
  const root = await fixture(t)
  const args = [cli, 'generate', 'react-component', 'card', '--package', 'packages/react', '--json']
  const preview = await promisify(execFile)(process.execPath, args, { cwd: root })
  const plan = JSON.parse(preview.stdout)
  expect(plan.files.map((file: { action: string }) => file.action)).toEqual(['create', 'create'])
  await expect(lstat(path.join(root, 'packages/react/src/components'))).rejects.toThrow()
  await promisify(execFile)(process.execPath, args.filter(value => value !== '--json'), { cwd: root })
  await expect(promisify(execFile)(process.execPath, [cli, 'new', 'react', '--template', 'react-lib'], { cwd: root })).rejects.toThrow(/already exists|已存在/)
})

it.for(['{ Card }', '{ key: Card }', '[Card]', '{ nested: { Card } }', '[...Card]'])('refuses a destructured export binding %s', async (binding, t) => {
  const root = await fixture(t)
  await write(root, 'packages/react/src/index.ts', `export const ${binding} = {} as any\n`)
  await expect(planGenerate({ cwd: root, package: 'packages/react', generator: 'react-component', parameters: { name: 'card', export: true } })).rejects.toThrow('Export name already exists')
  await expect(lstat(path.join(root, 'packages/react/src/components'))).rejects.toThrow()
})

it('inserts exports in module order while retaining comments with existing exports', async (t) => {
  const root = await fixture(t)
  await write(root, 'packages/react/src/index.ts', '// Existing counter.\nexport { Counter } from \'./counter.js\'\nexport type { CounterProps } from \'./counter.js\'\n')
  const plan = await planGenerate({ cwd: root, package: 'packages/react', generator: 'react-component', parameters: { name: 'card', export: true } })
  const barrel = plan.files.find(file => file.path === 'src/index.ts')!
  expect(barrel.after).toMatch(/^export .*components\/card.*\n\/\/ Existing counter\.\nexport/)
})

it('orders a new value export before a later type-only export', async (t) => {
  const root = await fixture(t)
  await write(root, 'packages/react/src/index.ts', 'export type { CounterProps } from \'./counter.js\'\n')
  const plan = await planGenerate({ cwd: root, package: 'packages/react', generator: 'react-component', parameters: { name: 'card', export: true } })
  expect(plan.files.find(file => file.path === 'src/index.ts')!.after).toMatch(/^export .*components\/card.*\nexport type/)
})

it('rejects named exports combined with a CommonJS export assignment', async (t) => {
  const root = await fixture(t)
  await write(root, 'packages/react/src/index.ts', 'const value = {}\nexport = value\n')
  await expect(planGenerate({ cwd: root, package: 'packages/react', generator: 'react-component', parameters: { name: 'card', export: true } })).rejects.toThrow('CommonJS export assignment')
})
