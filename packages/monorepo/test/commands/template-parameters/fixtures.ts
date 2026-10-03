import type { TemplateParameterManifest } from '@icebreakers/monorepo-templates'
import type { TestContext } from 'vitest'
import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { contents, write } from '../template-instances/fixtures'

export { contents, write }
export const manifest: TemplateParameterManifest = {
  schemaVersion: 1,
  parameters: { label: { type: 'string', default: 'demo' }, tests: { type: 'boolean', default: false }, flavor: { type: 'enum', options: ['plain', 'bold'], default: 'plain' }, token: { type: 'string', required: true, sensitive: true } },
  interpolate: ['src/index.ts', 'credentials.local', 'picture.bin'],
  conditions: [{ when: { parameter: 'tests', equals: true }, files: ['test'], package: { scripts: { test: 'node --test test/*.mjs' }, devDependencies: { 'example-only': '1.0.0' } } }],
}
export async function fixture(t: TestContext) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'repoctl-parameters-')))
  t.onTestFinished(() => fs.rm(root, { recursive: true, force: true }))
  const cwd = path.join(root, 'workspace')
  const source = path.join(root, 'source')
  await write(cwd, 'package.json', '{"name":"fixture","private":true}\n')
  await write(cwd, 'pnpm-workspace.yaml', 'packages: [packages/*]\n')
  await write(cwd, 'repoctl.config.mjs', `export default {commands:{create:{templatesDir:${JSON.stringify(source)},templateMap:{custom:{source:'sample',target:'packages/sample'}}}}}\n`)
  await write(source, 'sample/repoctl.template.json', JSON.stringify(manifest))
  await write(source, 'sample/package.json', '{"name":"source","version":"1.0.0"}\n')
  await write(source, 'sample/src/index.ts', 'export const label = {{repoctl-json:label}}\n')
  await write(source, 'sample/credentials.local', 'TOKEN={{repoctl:token}}\n')
  await write(source, 'sample/test/index.mjs', 'import assert from "node:assert/strict"\nassert.ok(true)\n')
  await fs.writeFile(path.join(source, 'sample/picture.bin'), Buffer.from([0, 255, 123, 123]))
  const options = { cwd, name: 'modules/sample', type: 'custom', parameters: { label: 'hello', tests: true, flavor: 'bold', token: 'secret-value-734' } }
  return { root, cwd, source, options, target: path.join(cwd, options.name) }
}
