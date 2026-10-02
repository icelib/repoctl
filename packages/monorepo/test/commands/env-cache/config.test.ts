import { spawnSync } from 'node:child_process'
import { chmod, symlink } from 'node:fs/promises'
import process from 'node:process'
import { checkEnvironmentCache } from '@icebreakers/monorepo'
import path from 'pathe'
import { expect, it } from 'vitest'
import { fixture, sourceRoot } from './fixture'

it('resolves root-qualified overrides and package array replacement or explicit extension like Turbo', async (t) => {
  const h = await fixture(t)
  await h.write('turbo.json', { globalEnv: ['GLOBAL'], tasks: { 'build': { env: ['GENERIC'], cache: false, inputs: ['src/**'] }, '@test/app#build': { env: ['QUALIFIED'] } } })
  await h.write('packages/app/turbo.jsonc', '{"extends":["//"],"tasks":{"build":{"env":["$TURBO_EXTENDS$","LOCAL"]}}}')
  await h.write('packages/app/src/index.ts', 'export const value = process.env.GLOBAL + process.env.GENERIC + process.env.QUALIFIED + process.env.LOCAL\n')
  const report = await checkEnvironmentCache(h.root)
  expect(report.tasks[0]!.cache).toBe(true)
  expect(Object.fromEntries(report.tasks[0]!.variables.map(item => [item.name, item.coverage]))).toEqual({ GENERIC: 'missing', GLOBAL: 'hash', LOCAL: 'hash', QUALIFIED: 'hash' })
  const turbo = spawnSync(path.join(sourceRoot, 'node_modules/.bin', process.platform === 'win32' ? 'turbo.cmd' : 'turbo'), ['run', 'build', '--dry=json'], { cwd: h.root, encoding: 'utf8', env: { PATH: process.env['PATH'], SystemRoot: process.env['SystemRoot'], TURBO_TELEMETRY_DISABLED: '1' }, timeout: 30000, shell: process.platform === 'win32' })
  expect(turbo.status, turbo.stderr).toBe(0)
  const actual = JSON.parse(turbo.stdout).tasks[0].resolvedTaskDefinition
  expect(actual.env.sort()).toEqual(['LOCAL', 'QUALIFIED'])
  expect(actual.cache).toBe(report.tasks[0]!.cache)
  await h.write('packages/app/turbo.jsonc', '{"extends":["//"],"tasks":{"build":{"env":["LOCAL"]}}}')
  expect((await checkEnvironmentCache(h.root)).tasks[0]!.variables.find(item => item.name === 'QUALIFIED')!.coverage).toBe('missing')
})

it('resolves ordered package inheritance and rejects cycles or malformed declarations without quoting values', async (t) => {
  const h = await fixture(t)
  await h.write('packages/config/package.json', { name: '@test/config', private: true })
  await h.write('packages/config/turbo.json', { extends: ['//'], tasks: { build: { env: ['SHARED'] } } })
  await h.write('packages/app/turbo.json', { extends: ['//', '@test/config'], tasks: { build: { env: ['$TURBO_EXTENDS$', 'LOCAL'] } } })
  await h.write('packages/app/src/index.ts', 'export const value = process.env.SHARED + process.env.LOCAL\n')
  expect((await checkEnvironmentCache(h.root)).tasks[0]!.variables.every(item => item.coverage === 'hash')).toBe(true)
  await h.write('packages/config/turbo.json', { extends: ['//', '@test/app'] })
  expect((await checkEnvironmentCache(h.root)).status).toBe('fail')
  await h.write('packages/app/turbo.json', { extends: ['//'], tasks: { build: { env: ['LOCAL', '$TURBO_EXTENDS$'] } } })
  expect((await checkEnvironmentCache(h.root)).status).toBe('fail')
})

it('keeps global hashing independent of task exclusions and respects inference opt-outs', async (t) => {
  const h = await fixture(t)
  await h.write('turbo.json', { globalEnv: ['GLOBAL_*'], tasks: { build: { env: ['!GLOBAL_*', '!VITE_PRIVATE*', 'HASH_*', '!HASH_SKIP'] } } })
  await h.write('packages/app/src/index.ts', 'export const x = process.env.GLOBAL_KEY + process.env.HASH_OK + process.env.HASH_SKIP + import.meta.env.VITE_PRIVATE_KEY + import.meta.env.VITE_PUBLIC_KEY\n')
  const report = await checkEnvironmentCache(h.root)
  expect(Object.fromEntries(report.tasks[0]!.variables.map(item => [item.name, item.coverage]))).toEqual({ GLOBAL_KEY: 'hash', HASH_OK: 'hash', HASH_SKIP: 'missing', VITE_PRIVATE_KEY: 'missing', VITE_PUBLIC_KEY: 'inferred' })
})

it('distinguishes ignored env files, explicit inputs, exclusions and root global dependencies', async (t) => {
  const h = await fixture(t)
  await h.write('.gitignore', '.env*\n')
  await h.write('.env', 'ROOT_SECRET=hidden\n')
  await h.write('packages/app/.env', 'APP_SECRET=hidden\n')
  await h.write('packages/app/.env.local', 'LOCAL_SECRET=hidden\n')
  await h.write('turbo.json', { globalDependencies: ['.env'], tasks: { build: { inputs: ['$TURBO_DEFAULT$', '.env*', '!.env.local'] } } })
  let report = await checkEnvironmentCache(h.root)
  expect(report.tasks[0]!.files).toEqual([{ path: '.env', coverage: 'global' }, { path: 'packages/app/.env', coverage: 'task' }, { path: 'packages/app/.env.local', coverage: 'missing' }])
  await h.write('turbo.json', { tasks: { build: {} } })
  report = await checkEnvironmentCache(h.root)
  expect(report.tasks[0]!.files.every(item => item.coverage === 'missing')).toBe(true)
  await h.write('turbo.json', { tasks: { build: { inputs: ['$TURBO_ROOT$/.env', '.env*'] } } })
  expect((await checkEnvironmentCache(h.root)).tasks[0]!.files.every(item => item.coverage === 'task')).toBe(true)
})

it('uses tracked/default inputs without assuming that every dotenv file is covered', async (t) => {
  const h = await fixture(t)
  await h.write('packages/app/.env.example', 'EXAMPLE=hidden\n')
  await h.write('turbo.json', { tasks: { build: { env: ['EXAMPLE'] } } })
  expect((await checkEnvironmentCache(h.root)).tasks[0]!.files).toEqual([{ path: 'packages/app/.env.example', coverage: 'default' }])
})

it.skipIf(process.platform === 'win32')('does not open actual dotenv files even when unreadable and skips linked source content', async (t) => {
  const h = await fixture(t)
  await h.write('packages/app/.env', 'SECRET_VALUE=never_read\n')
  await chmod(path.join(h.root, 'packages/app/.env'), 0)
  await h.write('outside.txt', 'export const secret = process.env.OUTSIDE_SENTINEL\n')
  await symlink(path.join(h.root, 'outside.txt'), path.join(h.root, 'packages/app/source.ts'))
  const report = await checkEnvironmentCache(h.root)
  expect(JSON.stringify(report)).not.toContain('OUTSIDE_SENTINEL')
  expect(report.tasks[0]!.files[0]).toEqual({ path: 'packages/app/.env', coverage: 'task' })
})
