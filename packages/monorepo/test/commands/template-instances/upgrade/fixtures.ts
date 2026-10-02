import type { TestContext } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
// eslint-disable-next-line antfu/no-import-dist
import { applyTemplateLinkPlan, planTemplateLink, rebuildTemplateInstanceBaseline } from '../../../../dist/index.mjs'
import { contents, fixture, write } from '../fixtures'

export { contents, write }
export const originalCode = '// header\nexport const first = 1\n\n// shared context\n\nexport const second = 1\n// footer\n'

export async function upgradeFixture(t: TestContext, code = originalCode, configure?: (source: string) => Promise<void>) {
  const f = await fixture(t)
  await write(f.sourceDir, 'templates/tsdown/src/index.ts', code)
  await configure?.(f.sourceDir)
  await applyTemplateLinkPlan(await planTemplateLink({ ...f.options, profile: 'workspace-copy-v1' }))
  const pristine = path.join(f.root, 'pristine')
  await rebuildTemplateInstanceBaseline(f.cwd, f.target, pristine)
  const targetDir = path.join(f.cwd, f.target)
  await fs.rm(targetDir, { recursive: true })
  await fs.cp(pristine, targetDir, { recursive: true })
  const nextSource = path.join(f.root, 'next-package')
  await fs.cp(f.sourceDir, nextSource, { recursive: true })
  await write(nextSource, 'package.json', '{"name":"@icebreakers/monorepo-templates","version":"2.0.0","scripts":{"postinstall":"exit 99"}}\n')
  await write(nextSource, 'template-data.mjs', 'throw new Error("Historical package code must never execute")\n')
  const options = { cwd: f.cwd, instance: f.target, version: '2.0.0', sourceDir: nextSource }
  return { ...f, targetDir, nextSource, options }
}
