import { Buffer } from 'node:buffer'
import { readFile, rm } from 'node:fs/promises'
import { applyUpgradePlan, planUpgrade } from '@icebreakers/monorepo'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { snapshot } from '../plan/fixture'
import { assetRoot, baselineFixture, recordPath } from './fixture'

describe('root asset baseline lifecycle', () => {
  it('retains user deletion even when upstream changed or overwrite is requested', async () => {
    const h = await baselineFixture()
    await h.seed('.editorconfig', 'old source\n', null)
    const before = await snapshot(h.root)
    const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'], overwrite: true })
    expect(plan.files[0]).toMatchObject({ status: 'skip', reason: 'user-deletion-preserved' })
    expect(plan.files[0]?.baseline).toBeUndefined()
    await applyUpgradePlan(h.cwd, plan)
    expect(await snapshot(h.root)).toEqual(before)
  })

  it.each(['unchanged', 'modified', 'already-removed'])('handles upstream removal of an %s local asset', async (kind) => {
    const h = await baselineFixture()
    const filename = '.github/workflows/removed-fixture.yml'
    await h.seed(filename, 'name: original\n', kind === 'modified' ? 'name: custom\n' : kind === 'already-removed' ? null : 'name: original\n')
    const before = await snapshot(h.root)
    const plan = await planUpgrade({ cwd: h.cwd, targets: [filename] })
    expect(plan.files[0]?.status).toBe(kind === 'modified' ? 'conflict' : kind === 'already-removed' ? 'identical' : 'delete')
    await applyUpgradePlan(h.cwd, plan)
    if (kind === 'modified') {
      expect(await snapshot(h.root)).toEqual(before)
    }
    else {
      await expect(h.read(filename)).rejects.toThrow('ENOENT')
      await expect(h.read(recordPath(filename))).rejects.toThrow('ENOENT')
      expect(await applyUpgradePlan(h.cwd, plan)).toEqual({ status: 'unchanged', changed: [] })
    }
  })

  it('applies and repeats a partial selection without advancing unselected baselines', async () => {
    const h = await baselineFixture()
    await h.seed('.editorconfig', h.upstream.replace('indent_size = 2', 'indent_size = 4'))
    const docker = await readFile(path.join(assetRoot, 'Dockerfile'), 'utf8')
    await h.seed('Dockerfile', `# historical comment\n${docker}`)
    const beforeDocker = await h.read(recordPath('Dockerfile'))
    const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig', 'Dockerfile'] })
    const selection = { files: ['.editorconfig'] }
    await applyUpgradePlan(h.cwd, plan, selection)
    expect(await h.read('.editorconfig')).toBe(h.upstream)
    expect(await h.read(recordPath('Dockerfile'))).toBe(beforeDocker)
    expect(await applyUpgradePlan(h.cwd, plan, selection)).toEqual({ status: 'unchanged', changed: [] })
    await expect(applyUpgradePlan(h.cwd, plan)).rejects.toThrow('partially applied')
  })

  it('refuses stale and malformed baselines before writing any selected asset', async () => {
    const h = await baselineFixture()
    await h.seed('.editorconfig', h.upstream.replace('indent_size = 2', 'indent_size = 4'))
    const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig', 'Dockerfile'] })
    await h.write(recordPath('.editorconfig'), '{}')
    const before = await snapshot(h.root)
    await expect(applyUpgradePlan(h.cwd, plan)).rejects.toThrow('Upgrade conflicts')
    expect(await snapshot(h.root)).toEqual(before)
    const invalid = await planUpgrade({ cwd: h.cwd })
    expect(invalid.status).toBe('blocked')
    expect(invalid.blockers[0]?.detail).toContain('Invalid root asset baseline')
  })

  it('restricts baselines to root ownership and rejects forged record updates', async () => {
    const h = await baselineFixture()
    await h.seed('packages/a/package.json', '{}')
    const outside = await planUpgrade({ cwd: h.cwd })
    expect(outside.status).toBe('blocked')
    await rm(path.join(h.cwd, recordPath('packages/a/package.json')))
    const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'] })
    const altered = structuredClone(plan)
    altered.files[0]!.baseline!.path = 'packages/a/package.json'
    await expect(applyUpgradePlan(h.cwd, altered)).rejects.toThrow('Invalid baseline operation')
    altered.files[0]!.baseline = { ...plan.files[0]!.baseline!, content: Buffer.from('{}').toString('base64') }
    await expect(applyUpgradePlan(h.cwd, altered)).rejects.toThrow('Invalid baseline content')
  })

  it('continues to apply a historical reviewed plan without inventing unreviewed baseline writes', async () => {
    const h = await baselineFixture()
    const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'] })
    delete plan.files[0]!.baseline
    plan.inputs = plan.inputs.filter(input => !input.path.startsWith('.repoctl/baselines/'))
    expect((await applyUpgradePlan(h.cwd, plan)).changed).toEqual(['.editorconfig'])
    await expect(h.read(recordPath('.editorconfig'))).rejects.toThrow('ENOENT')
  })
})
