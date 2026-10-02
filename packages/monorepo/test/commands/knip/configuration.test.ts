import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Use native Knip with the built repoctl API.
import { runKnipCheck, saveKnipBaseline } from '../../../dist/index.mjs'
import { fixture, json, snapshot, writeJson } from './fixture'

it('honors dynamic and tooling entrypoints, reviewed examples, generated outputs and native framework plugins', async () => {
  const h = await fixture()
  const app = path.join(h.workspace, 'packages/app')
  const manifest = await json(path.join(app, 'package.json'))
  await writeJson(path.join(app, 'package.json'), { ...manifest, dependencies: { ...manifest.dependencies, next: '^15.0.0' } })
  for (const directory of ['src/routes', 'tools', 'examples', 'generated', 'pages']) {
    await mkdir(path.join(app, directory), { recursive: true })
    await writeFile(path.join(app, directory, 'index.ts'), 'export const entry = 1\n')
  }
  await rm(path.join(h.workspace, 'knip.json'))
  const config = 'export default { workspaces: { ".": {}, "packages/*": { entry: ["src/main.ts", "src/routes/*.ts", "tools/*.ts"], project: ["**/*.ts"], ignore: ["generated/**"], ignoreFiles: ["examples/**"] } } }\n'
  const target = path.join(h.workspace, 'knip.config.ts')
  await writeFile(target, config)
  const before = await snapshot(h.workspace)
  const report = await runKnipCheck(h.workspace, { config: 'knip.config.ts' })
  expect(report.status, JSON.stringify(report.diagnostics)).toBe('completed')
  expect(report.scope!.plugins['packages/app']).toContain('next')
  const unusedFiles = report.findings.filter(item => item.type === 'files').map(item => item.file)
  expect(unusedFiles).toEqual(['packages/app/src/orphan.ts'])
  expect(await snapshot(h.workspace)).toEqual(before)
  expect(await readFile(target, 'utf8')).toBe(config)
})

it('uses native strict production analysis for dependency declarations masked at the root', async () => {
  const h = await fixture({ config: { workspaces: { '.': {}, 'packages/*': { entry: ['src/main.ts!'], project: ['src/**/*.ts!'] } } } })
  const root = path.join(h.workspace, 'package.json')
  const manifest = await json(root)
  await writeJson(root, { ...manifest, dependencies: { 'missing-package': '1.0.0' } })
  const normal = await runKnipCheck(h.workspace)
  expect(normal.findings.some(item => item.type === 'unlisted' && item.symbol === 'missing-package')).toBe(false)
  const strict = await runKnipCheck(h.workspace, { strict: true })
  expect(strict).toMatchObject({ status: 'completed', scope: { production: true, strict: true } })
  expect(strict.findings).toContainEqual(expect.objectContaining({ type: 'unlisted', symbol: 'missing-package', workspace: 'packages/app' }))
  await saveKnipBaseline(h.workspace, normal, 'baseline.json')
  expect((await runKnipCheck(h.workspace, { strict: true, baseline: 'baseline.json', newOnly: true })).exitCode).toBe(2)
})
