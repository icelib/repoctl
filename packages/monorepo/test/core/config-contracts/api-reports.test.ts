import { writeFile } from 'node:fs/promises'
import { validateConfigFile } from '@icebreakers/monorepo'
import path from 'pathe'
import { expect, it } from 'vitest'
import { cli, setup, snapshot } from '../../commands/api-report/fixture'
import { fixture, invoke } from './fixtures'

it('validates imported API report configuration and previews the same public declarations through built CLI', async () => {
  const root = await setup({ config: false })
  await writeFile(path.join(root, 'api-reports.mjs'), `export default ${JSON.stringify({
    '@test/sdk': {
      entries: { '.': { entryPoint: 'dist/index.d.ts', baseline: 'etc/sdk.api.md' } },
      tsconfig: 'tsconfig.json',
    },
  })}\n`)
  await writeFile(path.join(root, 'repoctl.config.mjs'), 'import apiReports from "./api-reports.mjs"; export default { tooling: { apiReports } }\n')
  const before = await snapshot(root)
  expect(await validateConfigFile(root)).toMatchObject({ valid: true, diagnostics: [] })
  const validated = invoke(root, ['config', 'validate', '--json'])
  expect(validated.status, validated.stderr).toBe(0)
  expect(JSON.parse(validated.stdout)).toMatchObject({ valid: true, diagnostics: [] })
  const preview = cli(root, ['update', '--json'])
  expect(preview.status, preview.stderr).toBe(0)
  expect(JSON.parse(preview.stdout).report.entries).toEqual([
    expect.objectContaining({ workspace: 'packages/sdk', subpath: '.', status: 'new', after: expect.stringContaining('greet(name: string): string') }),
  ])
  expect(await snapshot(root)).toEqual(before)
})

it.each([
  [null, 'tooling.apiReports'],
  [{ sdk: { entries: null } }, 'tooling.apiReports.sdk.entries'],
  [{ sdk: { entries: { '.': { entryPoint: 'dist/index.d.ts' } } } }, 'tooling.apiReports.sdk.entries.\\..baseline'],
  [{ sdk: { entries: {}, tsconfig: 1 } }, 'tooling.apiReports.sdk.tsconfig'],
  [{ sdk: { entries: { '.': { entryPoint: 'dist/index.d.ts', baseline: 'etc/sdk.api.md', typo: 'private-value' } } } }, 'tooling.apiReports.sdk.entries.\\..typo'],
])('rejects malformed API report structure with stable, redacted CLI diagnostics', async (apiReports, expectedPath) => {
  const root = await fixture(`export default ${JSON.stringify({ tooling: { apiReports } })}`)
  const result = invoke(root, ['config', 'validate', '--json'])
  expect(result.status, result.stderr).toBe(1)
  expect(JSON.parse(result.stdout)).toMatchObject({ valid: false, diagnostics: expect.arrayContaining([expect.objectContaining({ path: expectedPath })]) })
  expect(result.stdout + result.stderr).not.toContain('private-value')
})
