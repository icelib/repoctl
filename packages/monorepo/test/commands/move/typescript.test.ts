import { spawnSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import process from 'node:process'
import path from 'pathe'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Compile the actual migrated files from the delivered API.
import { applyWorkspaceMovePlan, planWorkspaceMove } from '../../../dist/index.mjs'
import { commit, fixture, writeJson } from './fixture'

it('typechecks explicit path aliases before and after moving and renaming their package', async () => {
  const h = await fixture({ 'packages/old': {}, 'packages/app': {} })
  await writeFile(path.join(h.workspace, 'packages/old/index.ts'), 'export const answer: number = 42\n')
  await writeFile(path.join(h.workspace, 'packages/app/main.ts'), 'import { answer } from "api"\nexport const result: number = answer\n')
  await writeJson(path.join(h.workspace, 'tsconfig.json'), {
    compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', baseUrl: '.', paths: { api: ['packages/old/index.ts'] }, noEmit: true, types: [], ignoreDeprecations: '6.0' },
    include: ['packages/app/*.ts'],
  })
  await commit(h.workspace)
  const require = createRequire(import.meta.url)
  const tsc = path.join(path.dirname(require.resolve('typescript/package.json')), 'bin/tsc')
  const compile = () => {
    const result = spawnSync(process.execPath, [tsc, '--project', path.join(h.workspace, 'tsconfig.json')], { encoding: 'utf8', timeout: 30_000 })
    expect(result.status, result.stdout + result.stderr).toBe(0)
  }
  compile()
  const plan = await planWorkspaceMove(h.workspace, { target: 'old', to: 'libs/core', name: '@org/core' })
  await applyWorkspaceMovePlan(h.workspace, plan)
  compile()
})
