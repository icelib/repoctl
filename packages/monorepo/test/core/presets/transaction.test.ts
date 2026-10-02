import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { execa } from 'execa'
import { expect, it } from 'vitest'
import { fixture, loadRepo, manifest, snapshot } from './fixture'

const assets = [{ source: 'a.ts', target: 'scripts/a.ts' }, { source: 'b.ts', target: 'scripts/b.ts' }]

async function prepared() {
  const h = await fixture()
  const ref = await h.install('@team/base', { ...manifest, assets })
  await h.config({ presets: [ref] })
  await h.write('node_modules/@team/base/a.ts', 'export const a = 1\n')
  await h.write('node_modules/@team/base/b.ts', 'export const b = 1\n')
  return h
}

async function inject(root: string, concurrent: boolean) {
  const entry = pathToFileURL(path.resolve(import.meta.dirname, '../../../dist/index.mjs')).href
  const script = `
    import fs from 'node:fs/promises';
    import { syncBuiltinESMExports } from 'node:module';
    import path from 'node:path';
    const original = fs.${concurrent ? 'rename' : 'link'};
    fs.${concurrent ? 'rename' : 'link'} = async (source, target) => {
      if (String(source).endsWith('.tmp') && String(target).replaceAll('\\\\', '/').endsWith('/scripts/b.ts')) {
        ${concurrent ? `await fs.writeFile(path.join(${JSON.stringify(root)}, 'scripts/a.ts'), 'concurrent edit\\n');` : ''}
        throw new Error('Injected preset write failure');
      }
      return original(source, target);
    };
    syncBuiltinESMExports();
    const repo = await import(${JSON.stringify(entry)});
    try { await repo.applyOrganizationPresetAssets(await repo.planOrganizationPresetAssets(${JSON.stringify(root)})); process.exitCode = 1; }
    catch (error) { process.stdout.write(error.message); }
  `
  return execa(process.execPath, ['--input-type=module', '-e', script], { cwd: root, reject: false, env: { NODE_ENV: 'production' } })
}

it('rolls back completed additions and all baselines when a later built transaction write fails', async () => {
  const h = await prepared()
  const before = await snapshot(h.root)
  const result = await inject(h.root, false)
  expect(result.exitCode, result.stderr).toBe(0)
  expect(result.stdout).toContain('Injected preset write failure')
  expect(await snapshot(h.root)).toEqual(before)
})

it('preserves concurrent edits and original backups instead of overwriting them during rollback', async () => {
  const repo = await loadRepo()
  const h = await prepared()
  const original = await repo.planOrganizationPresetAssets(h.root)
  await repo.applyOrganizationPresetAssets(original)
  await h.write('node_modules/@team/base/a.ts', 'export const a = 2\n')
  await h.write('node_modules/@team/base/b.ts', 'export const b = 2\n')
  const baseline = await h.read(original.files[0]!.baseline!.path)
  const result = await inject(h.root, true)
  expect(result.exitCode, result.stderr).toBe(0)
  expect(result.stdout).toContain('Preserve concurrent edits')
  expect(await h.read('scripts/a.ts')).toBe('concurrent edit\n')
  expect(await h.read('scripts/b.ts')).toBe('export const b = 1\n')
  expect(await h.read(original.files[0]!.baseline!.path)).toBe(baseline)
  const recovery = Object.entries(await snapshot(h.root)).filter(([file]) => file.endsWith('.bak'))
  expect(recovery).toHaveLength(1)
  expect(recovery[0]?.[1]).toBe('export const a = 1\n')
})

it('serializes competing applications and leaves one complete result', async () => {
  const repo = await loadRepo()
  const h = await prepared()
  const plan = await repo.planOrganizationPresetAssets(h.root)
  const results = await Promise.allSettled([repo.applyOrganizationPresetAssets(plan), repo.applyOrganizationPresetAssets(plan)])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: expect.objectContaining({ message: expect.stringContaining('locked') }) })
  expect((await repo.planOrganizationPresetAssets(h.root)).status).toBe('unchanged')
})

it('shares the root upgrade lock so competing asset providers cannot claim a target concurrently', async () => {
  const repo = await loadRepo()
  const h = await prepared()
  const plan = await repo.planOrganizationPresetAssets(h.root)
  await h.write('.repoctl/upgrade.lock', 'another active provider\n')
  await expect(repo.applyOrganizationPresetAssets(plan)).rejects.toThrow('locked')
  await expect(h.read('scripts/a.ts')).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await h.read('.repoctl/upgrade.lock')).toBe('another active provider\n')
})
