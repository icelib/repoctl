import { checkEnvironmentCache, formatEnvironmentCache } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { cli, fixture, snapshot } from './fixture'

it('reports hash, passthrough, inference, unknown names and precise static evidence without writes', async (t) => {
  const h = await fixture(t)
  await h.write('turbo.json', { globalEnv: ['SHARED_*'], globalPassThroughEnv: ['CI_TOKEN'], tasks: { build: { env: ['APP_*', '!APP_SECRET'], passThroughEnv: ['TASK_TOKEN'], inputs: ['$TURBO_DEFAULT$', '.env*'] } } })
  await h.write('packages/app/src/index.ts', `
    // process.env.COMMENT_ONLY
    const text = 'process.env.STRING_ONLY'
    export const value = process.env.APP_URL + process.env.APP_SECRET + process.env.SHARED_API
    const { TASK_TOKEN, CI_TOKEN: renamed } = process.env
    export const endpoint = import.meta.env.VITE_ENDPOINT
    export const literal = process.env['LITERAL_NAME']
    export const dynamic = process.env[lookup()]
  `)
  const before = await snapshot(h.root)
  const report = await checkEnvironmentCache(h.root)
  expect(await snapshot(h.root)).toEqual(before)
  expect(report.status).toBe('warn')
  const variables = Object.fromEntries(report.tasks[0]!.variables.map(item => [item.name, item.coverage]))
  expect(variables).toEqual({ APP_SECRET: 'missing', APP_URL: 'hash', CI_TOKEN: 'passthrough', LITERAL_NAME: 'missing', SHARED_API: 'hash', TASK_TOKEN: 'passthrough', VITE_ENDPOINT: 'inferred' })
  expect(report.tasks[0]!.dynamic).toEqual([expect.objectContaining({ path: 'packages/app/src/index.ts', line: 8, kind: 'dynamic' })])
  expect(report.findings.find(item => item.variable === 'APP_SECRET')).toMatchObject({ rule: 'env-unhashed', package: '@test/app', task: 'build', path: 'packages/app/src/index.ts', line: 4 })
})

it('scans example names and SFC scripts, keeping all values and source expressions out of every format', async (t) => {
  const h = await fixture(t)
  const secret = 'SECRET_SENTINEL_7fe222d3a7e54db1'
  await h.write('packages/app/.env', `REAL_SECRET=${secret}\n`)
  await h.write('packages/app/.env.example', `EXAMPLE_KEY=${secret}\nMULTILINE="first\nNOT_A_KEY=${secret}\nlast"\n`)
  await h.write('packages/app/src/app.vue', `<script setup lang="ts">const x = process.env.VUE_KEY; const key = '${secret}'; const y = process.env[key]</script><template>{{ ignored }}</template>`)
  const report = await checkEnvironmentCache(h.root)
  expect(report.tasks[0]!.variables.map(item => item.name)).toEqual(['EXAMPLE_KEY', 'MULTILINE', 'VUE_KEY'])
  for (const text of [JSON.stringify(report), formatEnvironmentCache(report), formatEnvironmentCache(report, true), cli(h.root, ['--json']).stdout, cli(h.root, ['--markdown']).stdout]) {
    expect(text).not.toContain(secret)
    expect(text).not.toContain('REAL_SECRET')
    expect(text).not.toContain('NOT_A_KEY')
    expect(text).toContain('EXAMPLE_KEY')
  }
  const strict = cli(h.root, ['--json', '--strict', '--dry-run'])
  expect(strict.status, strict.stderr).toBe(1)
  expect(JSON.parse(strict.stdout).kind).toBe('environment-cache-check')
})

it('supports reasoned suppressions and reports unused exceptions', async (t) => {
  const h = await fixture(t)
  await h.write('packages/app/src/index.ts', 'export const env = process.env[key]\n')
  await h.write('repoctl.config.mjs', 'export default {commands:{env:{suppressions:[{rule:"env-dynamic-access",package:"@test/app",task:"build",path:"packages/app/src/**",reason:"Validated by the runtime schema"}]}}}')
  let report = await checkEnvironmentCache(h.root)
  expect(report.status).toBe('pass')
  expect(report.summary.suppressed).toBe(1)
  expect(report.findings[0]!.suppression?.reason).toBe('Validated by the runtime schema')
  await h.write('packages/app/src/index.ts', 'export const value = 42\n')
  report = await checkEnvironmentCache(h.root)
  expect(report.findings[0]?.rule).toBe('env-suppression-unused')
  await h.write('repoctl.config.mjs', 'export default {commands:{env:{suppressions:[{rule:"env-dynamic-access",reason:""}]}}}')
  expect((await checkEnvironmentCache(h.root)).status).toBe('fail')
})

it('explains parse limits without echoing malformed source or configuration contents', async (t) => {
  const h = await fixture(t)
  const secret = 'DO_NOT_ECHO_a55dd118'
  await h.write('packages/app/src/index.ts', `export const x = ${secret}(`)
  const source = await checkEnvironmentCache(h.root)
  expect(source.findings[0]?.rule).toBe('env-source-unparsed')
  expect(JSON.stringify(source)).not.toContain(secret)
  await h.write('turbo.json', `{"globalEnv":["KEY=${secret}"]}`)
  const invalid = await checkEnvironmentCache(h.root)
  expect(invalid.status).toBe('fail')
  expect(JSON.stringify(invalid)).not.toContain(secret)
})

it('supports configured task selection, uncached tasks and disabling inference without changing existing env commands', async (t) => {
  const h = await fixture(t)
  await h.write('packages/app/src/index.ts', 'export const value = import.meta.env.VITE_API\n')
  expect((await checkEnvironmentCache(h.root)).tasks[0]!.variables[0]!.coverage).toBe('inferred')
  expect((await checkEnvironmentCache(h.root, { frameworkInference: false })).tasks[0]!.variables[0]!.coverage).toBe('missing')
  await h.write('repoctl.config.mjs', 'export default {commands:{env:{tasks:["dev"],frameworkInference:false}}}')
  const report = await checkEnvironmentCache(h.root)
  expect(report.tasks[0]).toMatchObject({ task: 'dev', cache: false })
  expect(report.status).toBe('pass')
  expect(report.summary.info).toBe(1)
  expect(cli(h.root, ['build', '--no-framework-inference', '--strict']).status).toBe(1)
})
