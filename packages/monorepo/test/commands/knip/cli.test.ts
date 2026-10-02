import { access, readFile } from 'node:fs/promises'
import path from 'pathe'
import { expect, it } from 'vitest'
import { emitPayload, fakeTool, fixture, nativePayload, runCli } from './fixture'

it('keeps default check and explicit Knip preview opt-in without executing the analyzer', async () => {
  const h = await fixture({ tool: false })
  await fakeTool(h.workspace, 'require("node:fs").writeFileSync("invoked", "yes")')
  for (const args of [['--json'], ['--full', '--json'], ['--staged', '--json']]) {
    const result = runCli(h, args)
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).not.toContain('knip-check')
  }
  const preview = runCli(h, ['knip', '--dry-run', '--json'])
  expect(preview.status, preview.stderr).toBe(0)
  expect(JSON.parse(preview.stdout)).toMatchObject({ kind: 'knip-check', status: 'ready' })
  const config = runCli(h, ['knip', '--recommend-config'])
  expect(config.status, config.stderr).toBe(0)
  expect(JSON.parse(config.stdout)).toHaveProperty('suggested.workspaces.packages/app')
  await expect(access(path.join(h.workspace, 'invoked'))).rejects.toThrow()
})

it('emits actual JSON findings, preserves exit status when saving and compares the explicit baseline', async () => {
  const h = await fixture({ tool: false })
  const finding = { type: 'exports', severity: 'error', filePath: 'packages/app/src/util.ts', workspace: 'packages/app', symbol: 'unused' }
  await fakeTool(h.workspace, emitPayload(nativePayload({ findings: [finding] }), 1))
  const saved = runCli(h, ['knip', '--json', '--save-baseline', 'baseline.json'])
  expect(saved.status, saved.stderr).toBe(1)
  expect(JSON.parse(saved.stdout)).toMatchObject({ kind: 'knip-report', status: 'completed', baselineSaved: { status: 'created' } })
  const before = await readFile(path.join(h.workspace, 'baseline.json'), 'utf8')
  const compared = runCli(h, ['knip', '--json', '--baseline', 'baseline.json', '--new-only'], path.join(h.workspace, 'packages/app'))
  expect(compared.status, compared.stderr).toBe(0)
  expect(JSON.parse(compared.stdout)).toMatchObject({ baseline: { status: 'valid', added: [], fixed: [] } })
  expect(await readFile(path.join(h.workspace, 'baseline.json'), 'utf8')).toBe(before)
  const inheritedJson = runCli(h, ['--json', 'knip'])
  expect(inheritedJson.status, inheritedJson.stderr).toBe(1)
  expect(JSON.parse(inheritedJson.stdout)).toMatchObject({ kind: 'knip-report', status: 'completed' })
})

it.each([
  ['--full', 'knip'],
  ['knip', '--new-only'],
  ['knip', '--save-baseline', 'baseline.json', '--dry-run'],
  ['knip', '--save-baseline', 'baseline.json', '--baseline', 'old.json'],
  ['knip', '--recommend-config', '--strict'],
  ['knip', '--timeout', 'invalid'],
])('rejects incompatible CLI options: %j', async (...args) => {
  const h = await fixture({ tool: false })
  expect(runCli(h, args).status).not.toBe(0)
})

it('emits failure JSON without saving a baseline when analysis cannot run', async () => {
  const h = await fixture({ tool: false })
  const result = runCli(h, ['knip', '--json', '--save-baseline', 'baseline.json'])
  expect(result.status).toBe(2)
  expect(JSON.parse(result.stdout)).toMatchObject({ status: 'failed', exitCode: 2 })
  await expect(access(path.join(h.workspace, 'baseline.json'))).rejects.toThrow()
})
