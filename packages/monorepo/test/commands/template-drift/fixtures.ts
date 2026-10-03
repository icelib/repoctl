import type { TemplateInstanceRegistry } from '@icebreakers/monorepo-templates'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { write } from '../template-instances/fixtures'

export { contents, write } from '../template-instances/fixtures'
export { upgradeFixture as fixture } from '../template-instances/upgrade/fixtures'
export const digest = (value: string) => createHash('sha256').update(value).digest('hex')

export async function editRegistry(cwd: string, edit: (registry: TemplateInstanceRegistry) => void) {
  const file = path.join(cwd, '.repoctl/template-instances.json')
  const registry = JSON.parse(await fs.readFile(file, 'utf8')) as TemplateInstanceRegistry
  edit(registry)
  await fs.writeFile(file, JSON.stringify(registry))
  return registry
}

export async function rootBaseline(cwd: string, filename = '.editorconfig', content = 'root source\n') {
  const hash = digest(content)
  const record = { schemaVersion: 1, path: filename, source: { package: '@icebreakers/monorepo-templates', version: '1.2.3', assetPath: filename, hash }, upstream: { hash, content: Buffer.from(content).toString('base64') } }
  const metadata = `.repoctl/baselines/root/${digest(filename)}.json`
  await write(cwd, metadata, JSON.stringify(record))
  await write(cwd, filename, content)
  return { record, metadata }
}
