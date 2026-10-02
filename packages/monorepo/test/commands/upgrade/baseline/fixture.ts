import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'pathe'
import { fixture } from '../plan/fixture'

const require = createRequire(import.meta.url)
export const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
export const recordPath = (filename: string) => `.repoctl/baselines/root/${digest(filename)}.json`
export const assetRoot = path.join(path.dirname(require.resolve('@icebreakers/monorepo-templates/package.json')), 'assets')

export async function baselineFixture() {
  const h = await fixture()
  const upstream = await readFile(path.join(assetRoot, '.editorconfig'), 'utf8')
  async function seed(filename: string, content: string | Uint8Array, local: string | Uint8Array | null = content) {
    const bytes = Buffer.from(content)
    const record = { schemaVersion: 1, path: filename, source: { package: '@icebreakers/monorepo-templates', version: '0.0.0-fixture', assetPath: filename, hash: digest(bytes) }, upstream: { hash: digest(bytes), content: bytes.toString('base64') } }
    await h.write(recordPath(filename), `${JSON.stringify(record, null, 2)}\n`)
    if (local !== null) {
      await h.write(filename, local)
    }
    return record
  }
  const read = (filename: string) => readFile(path.join(h.cwd, filename), 'utf8')
  return { ...h, upstream, seed, read }
}
