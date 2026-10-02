import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Validate baseline policy through delivered APIs.
import { runKnipCheck, saveKnipBaseline } from '../../../dist/index.mjs'
import { emitPayload, fakeTool, fixture, json, nativePayload, snapshot, writeJson } from './fixture'

it('explicitly saves, compares, updates and retains existing findings without hiding new errors', async () => {
  const h = await fixture()
  const original = await runKnipCheck(h.workspace)
  const baseline = path.join(h.workspace, 'baseline.json')
  expect(await saveKnipBaseline(h.workspace, original, 'baseline.json')).toMatchObject({ status: 'created', cleanupPending: [] })
  expect((await saveKnipBaseline(h.workspace, original, baseline)).status).toBe('unchanged')
  expect(original.exitCode).toBe(1)
  const options = { baseline: 'baseline.json', newOnly: true }
  const previous = await runKnipCheck(h.workspace, options)
  expect(previous).toMatchObject({ status: 'completed', exitCode: 0, baseline: { status: 'valid', added: [], fixed: [] } })
  expect(previous.baseline.existing).toHaveLength(original.findings.length)
  await writeFile(path.join(h.workspace, 'packages/app/src/util.ts'), '\n\nexport const used = 1\nexport const unused = 2\n')
  expect((await runKnipCheck(h.workspace, options)).baseline.added).toEqual([])
  await writeFile(path.join(h.workspace, 'packages/app/src/util.ts'), 'export const used = 1\nexport const replacement = 2\n')
  const changed = await runKnipCheck(h.workspace, options)
  expect(changed).toMatchObject({ status: 'completed', exitCode: 1, baseline: { status: 'valid' } })
  expect(changed.baseline.added).toContainEqual(expect.objectContaining({ symbol: 'replacement' }))
  expect(changed.baseline.fixed).toContainEqual(expect.objectContaining({ symbol: 'unused' }))
  expect((await saveKnipBaseline(h.workspace, changed, baseline)).status).toBe('updated')
  expect((await runKnipCheck(h.workspace, options)).exitCode).toBe(0)
  expect((await runKnipCheck(h.workspace, { baseline })).exitCode).toBe(1)
})

it('fails closed for missing, malformed, duplicate, tampered and incompatible baselines', async () => {
  const h = await fixture({ tool: false })
  const finding = { type: 'exports', severity: 'error', filePath: 'packages/app/src/util.ts', workspace: 'packages/app', symbol: 'unused' }
  await fakeTool(h.workspace, emitPayload(nativePayload({ findings: [finding] }), 1))
  const report = await runKnipCheck(h.workspace)
  await saveKnipBaseline(h.workspace, report, 'valid.json')
  const valid = await json(path.join(h.workspace, 'valid.json'))
  const invalid = [
    {},
    { ...valid, findings: [...valid.findings, ...valid.findings] },
    { ...valid, findings: [{ ...valid.findings[0], symbol: 'tampered' }] },
    ...['toolVersion', 'rootName'].map(key => ({ ...valid, scope: { ...valid.scope, [key]: 'changed' } })),
    { ...valid, scope: { ...valid.scope, production: true } },
    { ...valid, scope: { ...valid.scope, workspaces: ['.'] } },
  ]
  const missing = await runKnipCheck(h.workspace, { baseline: 'missing.json', newOnly: true })
  expect(missing).toMatchObject({ status: 'failed', exitCode: 2, baseline: { status: 'invalid' } })
  for (const value of invalid) {
    await writeJson(path.join(h.workspace, 'invalid.json'), value)
    expect(await runKnipCheck(h.workspace, { baseline: 'invalid.json', newOnly: true })).toMatchObject({ status: 'failed', exitCode: 2, baseline: { status: 'invalid' } })
  }
  await writeFile(path.join(h.workspace, 'invalid.json'), 'not json')
  expect((await runKnipCheck(h.workspace, { baseline: 'invalid.json', newOnly: true })).exitCode).toBe(2)
  await writeFile(path.join(h.workspace, 'knip.json'), '{}\n')
  expect((await runKnipCheck(h.workspace, { baseline: 'valid.json', newOnly: true })).exitCode).toBe(2)
})

it('treats severity escalation as a new error and warnings as nonblocking', async () => {
  const h = await fixture({ tool: false })
  const finding = { type: 'exports', severity: 'warn', filePath: 'packages/app/src/util.ts', workspace: 'packages/app', symbol: 'unused' }
  await fakeTool(h.workspace, emitPayload(nativePayload({ findings: [finding] })))
  const warnings = await runKnipCheck(h.workspace)
  expect(warnings.exitCode).toBe(0)
  await saveKnipBaseline(h.workspace, warnings, 'baseline.json')
  await fakeTool(h.workspace, emitPayload(nativePayload({ findings: [{ ...finding, severity: 'error' }] }), 1))
  const errors = await runKnipCheck(h.workspace, { baseline: 'baseline.json', newOnly: true })
  expect(errors.exitCode).toBe(1)
  expect(errors.baseline.added).toHaveLength(1)
  expect(errors.baseline.fixed).toHaveLength(1)
})

it('does not overwrite arbitrary files, escape the workspace or save incomplete analyses', async () => {
  const h = await fixture()
  const report = await runKnipCheck(h.workspace)
  const before = await snapshot(h.workspace)
  for (const target of ['package.json', 'knip.json', '../outside.json', 'missing/baseline.json']) {
    await expect(saveKnipBaseline(h.workspace, report, target)).rejects.toThrow()
  }
  await expect(saveKnipBaseline(h.workspace, { ...report, status: 'failed' }, 'baseline.json')).rejects.toThrow(/complete/)
  expect(await snapshot(h.workspace)).toEqual(before)
  await mkdir(path.join(h.workspace, 'reports'))
  await saveKnipBaseline(h.workspace, report, 'reports/baseline.json')
  expect(JSON.parse(await readFile(path.join(h.workspace, 'reports/baseline.json'), 'utf8'))).toMatchObject({ kind: 'knip-baseline' })
})
