import { writeFile } from 'node:fs/promises'
import path from 'pathe'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Exercise process and payload failures through the built API.
import { planKnipCheck, runKnipCheck } from '../../../dist/index.mjs'
import { emitPayload, fakeTool, fixture, nativePayload, snapshot } from './fixture'

it.each([
  ['no reporter output', 'console.log("ordinary output")'],
  ['broken JSON', 'console.log("__REPOCTL_KNIP_REPORT_V1__{")'],
  ['duplicate report', `${emitPayload()} ${emitPayload().replaceAll('const payload', 'var duplicate').replaceAll('payload.', 'duplicate.').replaceAll('JSON.stringify(payload)', 'JSON.stringify(duplicate)')}`],
  ['incomplete config', emitPayload(nativePayload({ hasConfigLoadErrors: true }))],
  ['no workspaces', emitPayload(nativePayload({ workspaces: [] }))],
  ['invalid diagnostic', emitPayload(nativePayload({ findings: [{}] }))],
  ['unexplained failure', emitPayload(nativePayload(), 1)],
  ['native analysis failure', emitPayload(nativePayload(), 2)],
])('fails closed for %s', async (_, script) => {
  const h = await fixture({ tool: false })
  await fakeTool(h.workspace, script)
  expect(await runKnipCheck(h.workspace)).toMatchObject({ status: 'failed', exitCode: 2 })
})

it('rejects unsupported local versions and malformed manifests without executing them', async () => {
  const h = await fixture({ tool: false })
  for (const version of ['5.0.0', '6.38.0', '7.0.0', '6.39.1-beta.0']) {
    await fakeTool(h.workspace, 'throw new Error("must not execute")', version)
    expect((await planKnipCheck(h.workspace)).status).toBe('unsupported_tool')
    expect((await runKnipCheck(h.workspace)).exitCode).toBe(2)
  }
  await writeFile(path.join(h.workspace, 'node_modules/knip/package.json'), '{')
  expect((await planKnipCheck(h.workspace)).status).toBe('unsupported_tool')
})

it('fails on timeout and cancellation without creating baseline or configuration files', async () => {
  const h = await fixture({ tool: false })
  await fakeTool(h.workspace, 'setInterval(() => {}, 1000)')
  const before = await snapshot(h.workspace)
  expect(await runKnipCheck(h.workspace, { timeoutMs: 30 })).toMatchObject({ status: 'failed', exitCode: 2 })
  expect(await runKnipCheck(h.workspace, { signal: AbortSignal.abort() })).toMatchObject({ status: 'failed', exitCode: 2 })
  expect(await snapshot(h.workspace)).toEqual(before)
})

it('retains stderr when native analysis terminates with an incomplete report', async () => {
  const h = await fixture({ tool: false })
  await fakeTool(h.workspace, 'console.error("configuration could not be loaded"); console.log("__REPOCTL_KNIP_REPORT_V1__{"); process.exitCode = 2')
  const report = await runKnipCheck(h.workspace)
  expect(report).toMatchObject({ status: 'failed', exitCode: 2, nativeExitCode: 2 })
  expect(report.diagnostics).toContainEqual({ code: 'knip_stderr', message: 'configuration could not be loaded' })
})

it('requires valid explicit options and never falls back from a missing explicit config', async () => {
  const h = await fixture()
  await expect(planKnipCheck(h.workspace, { newOnly: true })).rejects.toThrow(/baseline/)
  await expect(planKnipCheck(h.workspace, { timeoutMs: 0 })).rejects.toThrow(/positive/)
  await expect(planKnipCheck(h.workspace, { config: 'missing.ts' })).rejects.toThrow()
  await expect(planKnipCheck(h.workspace, { baseline: ' ' })).rejects.toThrow(/non-empty/)
})
