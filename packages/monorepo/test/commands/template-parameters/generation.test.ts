import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import { applyCreateNewProjectPlan, createNewProject, listTemplateInstances, resolveCreateNewProjectPlan } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { contents, fixture, write } from './fixtures'

it('previews without writing, matches prompts and JSON values, and keeps secrets out of all retained metadata', async (t) => {
  const f = await fixture(t)
  const before = await contents(f.cwd)
  const plan = await resolveCreateNewProjectPlan(f.options)
  expect(await contents(f.cwd)).toEqual(before)
  expect(JSON.stringify(plan)).not.toContain('secret-value-734')
  expect(plan.parameterization?.values['token']).toBe('[redacted]')
  expect(plan.parameterization?.package).toContainEqual({ section: 'scripts', name: 'test', status: 'include' })
  const prompted = await resolveCreateNewProjectPlan({ ...f.options, parameters: {}, parameterPrompt: async name => f.options.parameters[name as keyof typeof f.options.parameters] })
  expect(prompted).toEqual(plan)
  await applyCreateNewProjectPlan(plan, false)
  expect(await fs.readFile(path.join(f.target, 'src/index.ts'), 'utf8')).toBe('export const label = "hello"\n')
  expect(await fs.readFile(path.join(f.target, 'credentials.local'), 'utf8')).toContain('secret-value-734')
  expect(await fs.readFile(path.join(f.target, 'picture.bin'))).toEqual(Buffer.from([0, 255, 123, 123]))
  expect(await fs.readFile(path.join(f.cwd, 'pnpm-workspace.yaml'), 'utf8')).toContain('modules/*')
  const [record] = await listTemplateInstances(f.cwd)
  expect(record!.instance.parameters).toMatchObject({ templateValues: { label: 'hello', tests: true, flavor: 'bold' }, sensitiveParameters: ['token'] })
  expect(record!.instance.excludedPaths).toEqual(['credentials.local'])
  for (const text of Object.values(await contents(path.join(f.cwd, '.repoctl')))) {
    const decoded = Buffer.from(text, 'base64').toString('utf8')
    expect(decoded).not.toContain('secret-value-734')
    expect(decoded).not.toContain(Buffer.from('TOKEN=secret-value-734\n').toString('base64'))
  }
  const after = await contents(f.cwd)
  await expect(applyCreateNewProjectPlan(plan, false)).rejects.toThrow()
  expect(await contents(f.cwd)).toEqual(after)
})

it('omits disabled files, scripts and dependencies and preserves the legacy template path', async (t) => {
  const f = await fixture(t)
  await createNewProject({ ...f.options, parameters: { ...f.options.parameters, tests: false } })
  const files = await contents(f.target)
  expect(Object.keys(files)).not.toContain('test/index.mjs')
  expect(Object.keys(files)).not.toContain('repoctl.template.json')
  const pkg = JSON.parse(await fs.readFile(path.join(f.target, 'package.json'), 'utf8'))
  expect(pkg.scripts).toBeUndefined()
  expect(pkg.devDependencies).toBeUndefined()
  await write(f.source, 'sample/src/index.ts', 'export const label = "legacy"\n')
  await fs.rm(path.join(f.source, 'sample/repoctl.template.json'))
  const plan = await resolveCreateNewProjectPlan({ cwd: f.cwd, type: 'custom', name: 'modules/legacy' })
  expect(plan).not.toHaveProperty('parameterization')
})

it('rejects malformed parameters, changed sources and serialized secret plans before target writes', async (t) => {
  const f = await fixture(t)
  const before = await contents(f.cwd)
  for (const parameters of [{ ...f.options.parameters, tests: 'false' }, { ...f.options.parameters, flavor: 'wrong' }, { unknown: 'secret-value-734' }, { label: 'ok' }]) {
    await expect(resolveCreateNewProjectPlan({ ...f.options, parameters: parameters as never })).rejects.toThrow('Template parameter')
    expect(await contents(f.cwd)).toEqual(before)
  }
  const plan = await resolveCreateNewProjectPlan(f.options)
  await expect(applyCreateNewProjectPlan(JSON.parse(JSON.stringify(plan)))).rejects.toThrow('private inputs')
  const downgraded = JSON.parse(JSON.stringify(plan))
  delete downgraded.parameterization
  await expect(applyCreateNewProjectPlan(downgraded)).rejects.toThrow('private inputs')
  const modified = await resolveCreateNewProjectPlan(f.options)
  delete modified.parameterization
  await expect(applyCreateNewProjectPlan(modified)).rejects.toThrow('private inputs')
  await write(f.source, 'sample/src/index.ts', 'changed upstream\n')
  await expect(applyCreateNewProjectPlan(plan)).rejects.toThrow('source changed')
  expect(await contents(f.cwd)).toEqual(before)
})

it('rewrites template references before interpolating ordinary or sensitive values', async (t) => {
  const f = await fixture(t)
  const manifestPath = path.join(f.source, 'sample/repoctl.template.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  manifest.interpolate.push('src/secret.ts')
  await fs.writeFile(manifestPath, JSON.stringify(manifest))
  await write(f.source, 'sample/src/index.ts', 'export const label = {{repoctl-json:label}}\nexport const root = "../../tsconfig.json"\n')
  await write(f.source, 'sample/src/secret.ts', 'export const token = {{repoctl-json:token}}\n')
  const label = '../../tsconfig.json @icebreakers/monorepo/tooling'
  await createNewProject({ ...f.options, parameters: { ...f.options.parameters, label, token: label } })
  expect(await fs.readFile(path.join(f.target, 'src/index.ts'), 'utf8')).toBe(`export const label = ${JSON.stringify(label)}\nexport const root = "../../../tsconfig.json"\n`)
  expect(await fs.readFile(path.join(f.target, 'src/secret.ts'), 'utf8')).toBe(`export const token = ${JSON.stringify(label)}\n`)
})
