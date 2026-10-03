import { checkEnvironmentCache } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { fixture } from './fixture'

it('distinguishes default global hashes from built-in passthrough and applies task exclusions last', async (t) => {
  const h = await fixture(t)
  await h.write('turbo.json', { globalEnv: ['!VERCEL_ANALYTICS_ID'], globalPassThroughEnv: ['GLOBAL_TOKEN'], tasks: { build: { passThroughEnv: ['!GLOBAL_TOKEN', '!CI'] } } })
  await h.write('packages/app/src/index.ts', 'export const x = process.env.VERCEL_ANALYTICS_ID + process.env.VERCEL_TARGET_ENV + process.env.GLOBAL_TOKEN + process.env.CI + process.env.DOCKER_HOST + process.env.PNPM_HOME\n')
  const report = await checkEnvironmentCache(h.root)
  expect(Object.fromEntries(report.tasks[0]!.variables.map(item => [item.name, item.coverage]))).toEqual({ CI: 'missing', DOCKER_HOST: 'passthrough', GLOBAL_TOKEN: 'missing', PNPM_HOME: 'passthrough', VERCEL_ANALYTICS_ID: 'passthrough', VERCEL_TARGET_ENV: 'hash' })
})

it('honors disabled tasks and fresh definitions that opt out of inherited env declarations', async (t) => {
  const h = await fixture(t)
  await h.write('turbo.json', { tasks: { build: { env: ['INHERITED'] } } })
  await h.write('packages/app/src/index.ts', 'export const x = process.env.INHERITED + process.env.LOCAL\n')
  await h.write('packages/app/turbo.json', { extends: ['//'], tasks: { build: { extends: false } } })
  expect((await checkEnvironmentCache(h.root)).tasks).toEqual([])
  await h.write('packages/app/turbo.json', { extends: ['//'], tasks: { build: { extends: false, env: ['LOCAL'] } } })
  const report = await checkEnvironmentCache(h.root)
  expect(Object.fromEntries(report.tasks[0]!.variables.map(item => [item.name, item.coverage]))).toEqual({ INHERITED: 'missing', LOCAL: 'hash' })
})

it('lets root-relative input exclusions remove explicit env-file coverage', async (t) => {
  const h = await fixture(t)
  await h.write('.env', 'ROOT_VALUE=secret\n')
  await h.write('turbo.json', { tasks: { build: { inputs: ['$TURBO_ROOT$/.env*', '!$TURBO_ROOT$/.env'] } } })
  expect((await checkEnvironmentCache(h.root)).tasks[0]!.files).toEqual([{ path: '.env', coverage: 'missing' }])
})

it('keeps root env files outside package defaults and never treats negative-only globs as inclusions', async (t) => {
  const h = await fixture(t)
  await h.write('.env', 'ROOT_VALUE=secret\n')
  await h.write('packages/app/.env', 'APP_VALUE=secret\n')
  await h.write('turbo.json', { tasks: { build: {} } })
  expect((await checkEnvironmentCache(h.root)).tasks[0]!.files).toEqual([{ path: '.env', coverage: 'missing' }, { path: 'packages/app/.env', coverage: 'default' }])
  await h.write('turbo.json', { globalDependencies: ['!README.md'], tasks: { build: { inputs: ['!README.md'] } } })
  expect((await checkEnvironmentCache(h.root)).tasks[0]!.files.every(item => item.coverage === 'missing')).toBe(true)
  await h.write('turbo.json', { globalDependencies: ['!.env', '.env'], tasks: { build: { inputs: ['src/**'] } } })
  expect((await checkEnvironmentCache(h.root)).tasks[0]!.files.every(item => item.coverage === 'missing')).toBe(true)
})

it('fails unsupported global configuration and object-form task inputs instead of guessing their hash coverage', async (t) => {
  const h = await fixture(t)
  await h.write('turbo.json', { futureFlags: { globalConfiguration: true }, global: { env: ['SECRET'] }, tasks: { build: {} } })
  expect((await checkEnvironmentCache(h.root)).status).toBe('fail')
  await h.write('turbo.json', { tasks: { build: { inputs: [{ mode: 'jit', globs: ['.env'] }] } } })
  expect((await checkEnvironmentCache(h.root)).status).toBe('fail')
})
