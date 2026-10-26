import { validateConfigFile } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { fixture, invoke } from './fixtures'

it('accepts declarative native hook checks through the public config API and built CLI', async () => {
  const cwd = await fixture(`export default ${JSON.stringify({ tooling: { hooks: { preCommit: [
    { name: 'inventory', run: 'pnpm inventory:check', glob: '**/*.vue', stageFixed: true },
    { name: 'skills', run: 'pnpm skills:check' },
  ] } } })}`)
  expect(await validateConfigFile(cwd)).toMatchObject({ valid: true, diagnostics: [] })
  const result = invoke(cwd, ['config', 'validate', '--json'])
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({ valid: true })
})

it.each([
  [{ preCommit: [{ run: 'pnpm check' }] }, 'tooling.hooks.preCommit[0].name'],
  [{ preCommit: [{ name: 'check', run: 1 }] }, 'tooling.hooks.preCommit[0].run'],
  [{ preCommit: [{ name: 'check', run: 'pnpm check', stage_fixed: true }] }, 'tooling.hooks.preCommit[0].stage_fixed'],
  [{ prePush: [] }, 'tooling.hooks.prePush'],
])('rejects malformed domain check configuration before installation', async (hooks, expectedPath) => {
  const cwd = await fixture(`export default ${JSON.stringify({ tooling: { hooks } })}`)
  expect(await validateConfigFile(cwd)).toMatchObject({ valid: false, diagnostics: expect.arrayContaining([expect.objectContaining({ path: expectedPath })]) })
})
