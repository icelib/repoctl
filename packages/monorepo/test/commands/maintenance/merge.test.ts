import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { prepareMaintenanceUpgrade } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { digest, fixture } from './fixture'

async function mergeFixture(overlapping: boolean) {
  const h = await fixture()
  expect((await prepareMaintenanceUpgrade(h.options)).status).toBe('ready')
  const upstream = await readFile(path.join(h.cwd, '.editorconfig'), 'utf8')
  const baselinePath = `.repoctl/baselines/root/${digest('.editorconfig')}.json`
  const record = JSON.parse(await readFile(path.join(h.cwd, baselinePath), 'utf8'))
  const old = upstream.replace('indent_size = 2', 'indent_size = 4')
  record.source.hash = digest(old)
  record.upstream = { hash: digest(old), content: Buffer.from(old).toString('base64') }
  const local = overlapping ? old.replace('indent_size = 4', 'indent_size = 8') : old.replace('root = true', 'root = false')
  await h.write(baselinePath, `${JSON.stringify(record, null, 2)}\n`)
  await h.write('.editorconfig', local)
  h.git(['add', '.'])
  h.git(['-c', 'commit.gpgsign=false', 'commit', '-qm', 'retain customized old assets'])
  h.calls.length = 0
  const options = { ...h.options, head: h.git(['rev-parse', 'HEAD']), outputDirectory: path.join(h.root, 'merge-artifact') }
  return { ...h, options, baselinePath, upstream, old, local }
}

it('preserves disjoint local edits while upgrading and records only upstream baseline bytes', async () => {
  const h = await mergeFixture(false)
  const report = await prepareMaintenanceUpgrade(h.options)
  expect(report.status, report.errors.join()).toBe('ready')
  expect(await readFile(path.join(h.cwd, '.editorconfig'), 'utf8')).toBe(h.upstream.replace('root = true', 'root = false'))
  const record = JSON.parse(await readFile(path.join(h.cwd, h.baselinePath), 'utf8'))
  expect(Buffer.from(record.upstream.content, 'base64').toString()).toBe(h.upstream)
  expect(report.files.find(file => file.path === '.editorconfig')?.beforeHash).toBe(digest(h.gitBytes(['show', `${report.head}:.editorconfig`])))
})

it('keeps overlapping local edits and baseline intact and reports the conflict without running scripts', async () => {
  const h = await mergeFixture(true)
  const baseline = await readFile(path.join(h.cwd, h.baselinePath), 'utf8')
  const report = await prepareMaintenanceUpgrade(h.options)
  expect(report.status).toBe('blocked')
  expect(report.plan?.files.find(file => file.path === '.editorconfig')).toMatchObject({ status: 'conflict', reason: 'overlapping-merge-conflict' })
  expect(report.patchHash).toBeNull()
  expect(h.calls).toEqual([])
  expect(await readFile(path.join(h.cwd, '.editorconfig'), 'utf8')).toBe(h.local)
  expect(await readFile(path.join(h.cwd, h.baselinePath), 'utf8')).toBe(baseline)
  expect(h.git(['status', '--porcelain'])).toBe('')
})
