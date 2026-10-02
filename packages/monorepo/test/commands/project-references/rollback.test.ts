import { execFile } from 'node:child_process'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist
import { applyProjectReferencesPlan, planProjectReferences } from '../../../dist/index.mjs'
import { fixture, settings, sourceRoot } from './fixtures'

async function failReplacement(root: string, concurrent: boolean | 'registry' = false) {
  const script = `
    import fs from 'node:fs/promises'
    import path from 'node:path'
    import { syncBuiltinESMExports } from 'node:module'
    const [root, entry, concurrent] = process.argv.slice(1)
    const rename = fs.rename
    const copyFile = fs.copyFile
    fs.copyFile = async (source, target, flags) => {
      if (concurrent === 'registry' && source === path.join(root, 'tsconfig.json')) {
        const registry = path.join(root, '.repoctl/typescript-references.json')
        await fs.unlink(registry)
        await fs.writeFile(registry, '')
        throw new Error('Injected preparation failure')
      }
      return copyFile(source, target, flags)
    }
    fs.rename = async (source, target) => {
      if (source.endsWith('.tmp') && target === path.join(root, 'tsconfig.json')) {
        if (concurrent === 'true') await fs.writeFile(path.join(root, 'packages/app/tsconfig.json'), 'concurrent business edit\\n')
        throw new Error('Injected reference replacement failure')
      }
      return rename(source, target)
    }
    syncBuiltinESMExports()
    const { applyProjectReferencesPlan, planProjectReferences } = await import(entry)
    try { await applyProjectReferencesPlan(await planProjectReferences(root)); throw new Error('unexpected success') }
    catch (error) { process.stdout.write(error.message) }
  `
  return (await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script, root, pathToFileURL(path.join(sourceRoot, 'packages/monorepo/dist/index.mjs')).href, String(concurrent)])).stdout
}

it('rolls back every replacement and newly created registry after a mid-transaction failure', async (t) => {
  const root = await fixture(t)
  await settings(root, { enabled: true, relations: [{ source: 'packages/app/tsconfig.json', target: 'packages/lib/tsconfig.json' }] })
  const plan = await planProjectReferences(root)
  expect(await failReplacement(root)).toContain('Injected reference replacement failure')
  for (const item of plan.operations.filter(item => item.before !== null)) {
    expect(await readFile(path.join(root, item.path), 'utf8')).toBe(item.before)
  }
  await expect(readFile(path.join(root, '.repoctl/typescript-references.json'))).rejects.toThrow()
  expect((await readdir(root)).some(file => file.includes('.repoctl-references-'))).toBe(false)
})

it('retains backups and concurrent edits when automatic rollback is unsafe', async (t) => {
  const root = await fixture(t)
  await settings(root, { enabled: true, relations: [{ source: 'packages/app/tsconfig.json', target: 'packages/lib/tsconfig.json' }] })
  const plan = await planProjectReferences(root)
  const edited = path.join(root, 'packages/app/tsconfig.json')
  expect(await failReplacement(root, true)).toContain('preserve recovery files')
  expect(await readFile(edited, 'utf8')).toBe('concurrent business edit\n')
  const backup = (await readdir(path.dirname(edited))).find(file => file.endsWith('.bak'))!
  expect(await readFile(path.join(path.dirname(edited), backup), 'utf8')).toBe(plan.operations.find(item => item.path === 'packages/app/tsconfig.json')!.before)
})

it('never deletes an empty registry replaced by another writer during failed preparation', async (t) => {
  const root = await fixture(t)
  const before = await readFile(path.join(root, 'tsconfig.json'), 'utf8')
  expect(await failReplacement(root, 'registry')).toContain('preserve recovery files')
  expect(await readFile(path.join(root, '.repoctl/typescript-references.json'), 'utf8')).toBe('')
  expect(await readFile(path.join(root, 'tsconfig.json'), 'utf8')).toBe(before)
})

it('serializes concurrent applies and leaves the committed graph and registry consistent', async (t) => {
  const root = await fixture(t)
  const plan = await planProjectReferences(root)
  const outcomes = await Promise.allSettled([applyProjectReferencesPlan(plan), applyProjectReferencesPlan(plan)])
  expect(outcomes.filter(item => item.status === 'fulfilled')).toHaveLength(1)
  const rejected = outcomes.find(item => item.status === 'rejected') as PromiseRejectedResult
  expect(rejected.reason.message).toContain('locked')
  expect((await planProjectReferences(root)).action).toBe('unchanged')
  expect((await readdir(path.join(root, '.repoctl'))).some(file => file.endsWith('.lock'))).toBe(false)
})

it('preserves an existing writer lock and leaves its transaction files untouched', async (t) => {
  const root = await fixture(t)
  const plan = await planProjectReferences(root)
  await mkdir(path.join(root, '.repoctl'))
  const lock = path.join(root, '.repoctl/typescript-references.lock')
  await writeFile(lock, 'another writer\n')
  await expect(applyProjectReferencesPlan(plan)).rejects.toThrow('locked')
  expect(await readFile(lock, 'utf8')).toBe('another writer\n')
  expect((await planProjectReferences(root)).action).toBe('update')
})
