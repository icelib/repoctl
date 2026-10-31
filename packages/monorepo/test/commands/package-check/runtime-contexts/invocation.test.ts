import type { ConsumerEntry } from '../../../../src/commands/package-check/types'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it } from 'vitest'
import { expectedErrorConsumerSource } from '../../../../src/commands/package-check/consumer/runtime-contexts/source'
import { vitestConsumerInvocation } from '../../../../src/commands/package-check/consumer/runtime-contexts/vitest'

const roots: string[] = []
const entry: ConsumerEntry = { subpath: './setup', target: './setup.mjs', format: 'esm', runtime: true, context: 'vitest' }
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))))

async function fixture() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'repoctl-context-invocation-')))
  roots.push(root)
  const framework = path.join(root, 'node_modules/vitest')
  await mkdir(framework, { recursive: true })
  await writeFile(path.join(framework, 'package.json'), JSON.stringify({ name: 'vitest', version: '5.0.5', bin: { vitest: './vitest.mjs' }, exports: { '.': { import: './index.mjs', require: './index.cjs' }, './package.json': './package.json' } }))
  await writeFile(path.join(framework, 'vitest.mjs'), '')
  await writeFile(path.join(framework, 'index.mjs'), '')
  await writeFile(path.join(root, 'package.json'), '{"private":true}')
  return { root, framework }
}

it.each([
  [`throw new Error("requires its build plugin")`, true],
  ['export const routes = []', false],
  ['throw new Error("different failure")', false],
  ['throw new TypeError("requires its build plugin")', false],
  ['throw { name: "Error", message: "requires its build plugin" }', false],
  ['throw "requires its build plugin"', false],
  ['throw null', false],
  ['throw undefined', false],
] as const)('imports guarded entries and accepts only their precise Error contract: %s', (body, valid) => {
  const specifier = `data:text/javascript,${encodeURIComponent(body)}`
  const source = expectedErrorConsumerSource(specifier, { kind: 'expected-error', name: 'Error', message: 'requires its build plugin' })
  const result = spawnSync(process.execPath, ['--input-type', 'module', '--eval', source], { encoding: 'utf8' })
  expect(result.status, result.stderr).toBe(valid ? 0 : 1)
})

it('creates a real framework smoke case, checks the export boundary and loads the isolated CLI', async () => {
  const { root, framework } = await fixture()
  const args = await vitestConsumerInvocation(entry, '@fixture/api/setup', root, root)
  expect(args).toHaveLength(1)
  const runner = await readFile(args[0]!, 'utf8')
  expect(runner).toContain('import.meta.resolve("@fixture/api/setup")')
  expect(runner).toContain('vitest.mjs')
  const configSource = await readFile(path.join(path.dirname(args[0]!), 'vitest.config.mjs'), 'utf8')
  const config = JSON.parse(configSource.slice('export default '.length, -2)) as { root: string, test: { include: string[], setupFiles: string[], passWithNoTests: boolean, watch: boolean } }
  expect(config.root).toBe(root)
  expect(config.test.setupFiles).toEqual(['@fixture/api/setup'])
  expect(config.test.passWithNoTests).toBe(false)
  expect(config.test.watch).toBe(false)
  const testSource = await readFile(path.join(root, config.test.include[0]!), 'utf8')
  expect(testSource).toContain('declared setup executes in Vitest')
  expect(testSource).toContain(path.basename(framework))
})

it('resolves Vitest from the subject package even when it is not a top-level dependency', async () => {
  const { root, framework } = await fixture()
  const subject = path.join(root, 'node_modules/subject')
  await mkdir(path.join(subject, 'node_modules'), { recursive: true })
  await rm(framework, { recursive: true })
  const nested = path.join(subject, 'node_modules/vitest')
  await mkdir(nested)
  await writeFile(path.join(nested, 'package.json'), JSON.stringify({ name: 'vitest', version: '5.0.5', bin: 'vitest.mjs', exports: { '.': './index.mjs', './package.json': './package.json' } }))
  await writeFile(path.join(nested, 'vitest.mjs'), '')
  await writeFile(path.join(nested, 'index.mjs'), '')
  expect(await vitestConsumerInvocation(entry, 'subject/setup', root, subject)).toHaveLength(1)
})

it('refuses a Vitest resolved from an ancestor outside the isolated consumer', async () => {
  const { root } = await fixture()
  const consumer = path.join(root, 'consumer')
  await mkdir(consumer)
  await expect(vitestConsumerInvocation(entry, '@fixture/api/setup', consumer, consumer)).rejects.toThrow('outside its isolated directory')
})

it.each(['package.json', 'vitest.mjs', 'index.mjs'])('refuses an escaping framework %s symlink', async (filename) => {
  const { root, framework } = await fixture()
  const { root: outside, framework: external } = await fixture()
  await rm(path.join(framework, filename))
  await symlink(path.join(external, filename), path.join(framework, filename))
  expect(outside).not.toBe(root)
  await expect(vitestConsumerInvocation(entry, '@fixture/api/setup', root, root)).rejects.toThrow('outside its isolated directory')
})
