import { readFile, writeFile } from 'node:fs/promises'
import { applyPublicApiUpdate, checkPublicApi, planPublicApiUpdate } from '@icebreakers/monorepo'
import path from 'pathe'
import { expect, it } from 'vitest'
import { config, setup, snapshot, writeJson } from './fixture'

it('rejects a changed extended TypeScript config even when the public signatures remain equal', async () => {
  const root = await setup()
  const filename = path.join(root, 'packages/sdk/tsconfig.json')
  const project = JSON.parse(await readFile(filename, 'utf8'))
  await writeJson(path.join(root, 'tsconfig.shared.json'), { compilerOptions: { strict: false } })
  await writeJson(filename, { ...project, extends: '../../tsconfig.shared.json' })
  const plan = await planPublicApiUpdate(root)
  expect(plan.report.status).toBe('changes')
  expect(plan.report.entries[0]!.inputs.some(input => input.path.endsWith('tsconfig.shared.json'))).toBe(true)
  await writeJson(path.join(root, 'tsconfig.shared.json'), { compilerOptions: { strict: true } })
  expect((await checkPublicApi(root)).entries[0]!.after).toBe(plan.report.entries[0]!.after)
  await expect(applyPublicApiUpdate(root, plan)).rejects.toThrow('changed')
})

it('respects explicit types exports and rejects unsupported versioned type fallbacks', async () => {
  const root = await setup()
  const file = path.join(root, 'packages/sdk/package.json')
  const manifest = JSON.parse(await readFile(file, 'utf8'))
  await writeFile(path.join(root, 'packages/sdk/dist/internal.d.ts'), '/** @public */\nexport declare const hidden: number;\n')
  await writeJson(file, { ...manifest, exports: { '.': { types: './dist/index.d.ts', default: './dist/internal.js' } } })
  await config(root, { '.': { entryPoint: 'dist/internal.d.ts', baseline: 'etc/sdk.api.md' } })
  const before = await snapshot(root)
  expect((await checkPublicApi(root)).entries[0]).toMatchObject({ status: 'failed', diagnostics: [{ code: 'api-analysis-failed', message: expect.stringContaining('not a literal public') }] })
  expect(await snapshot(root)).toEqual(before)
  await writeJson(file, { ...manifest, exports: { '.': { 'types@>=5.0': './dist/index.d.ts', 'default': './dist/internal.js' } } })
  expect((await checkPublicApi(root)).entries[0]!.status).toBe('failed')
})
