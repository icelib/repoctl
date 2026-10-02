import { readFile, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Exercise the delivered API with real Knip.
import { getKnipConfigurationSuggestions, planKnipCheck, runKnipCheck } from '../../../dist/index.mjs'
import { fixture, snapshot } from './fixture'

it('reports real unused files, exports, dependencies and unlisted imports without deleting or editing resources', async () => {
  const h = await fixture()
  const before = await snapshot(h.workspace)
  const report = await runKnipCheck(path.join(h.workspace, 'packages/app'))
  expect(report.status, JSON.stringify(report.diagnostics)).toBe('completed')
  expect(report.exitCode).toBe(1)
  for (const type of ['files', 'exports', 'dependencies', 'unlisted']) {
    expect(report.findings, type).toContainEqual(expect.objectContaining({ type, workspace: 'packages/app', severity: 'error' }))
  }
  expect(report.findings).toContainEqual(expect.objectContaining({ type: 'exports', symbol: 'unused', line: 2, file: 'packages/app/src/util.ts' }))
  expect(await snapshot(h.workspace)).toEqual(before)
})

it('provides installation guidance without downloading or falling back when local Knip is missing', async () => {
  const h = await fixture({ tool: false })
  const before = await snapshot(h.workspace)
  expect((await planKnipCheck(h.workspace)).status).toBe('missing_tool')
  const report = await runKnipCheck(h.workspace)
  expect(report).toMatchObject({ status: 'failed', exitCode: 2, findings: [] })
  expect(report.diagnostics[0]!.message).toContain('pnpm add -Dw knip@^6.39.0')
  expect(await snapshot(h.workspace)).toEqual(before)
})

it('preserves existing native configuration and warning severities', async () => {
  const h = await fixture({ config: {
    rules: { files: 'warn', exports: 'warn', dependencies: 'warn', unlisted: 'warn' },
    workspaces: { '.': {}, 'packages/*': { entry: ['src/main.ts'], project: ['src/**/*.ts'] } },
  } })
  const file = path.join(h.workspace, 'knip.json')
  const original = await readFile(file, 'utf8')
  const suggestions = await getKnipConfigurationSuggestions(h.workspace)
  expect(suggestions.existing).toContain('knip.json')
  expect(suggestions.suggested).toHaveProperty('workspaces.packages/app')
  const report = await runKnipCheck(h.workspace)
  expect(report.status, JSON.stringify(report.diagnostics)).toBe('completed')
  expect(report.summary.errors).toBe(0)
  expect(report.summary.warnings).toBeGreaterThanOrEqual(4)
  expect(report.exitCode).toBe(0)
  expect(await readFile(file, 'utf8')).toBe(original)
  await writeFile(path.join(h.workspace, 'packages/app/src/util.ts'), 'export const used = 1\n')
  expect((await runKnipCheck(h.workspace)).findings.some(item => item.type === 'exports')).toBe(false)
})
