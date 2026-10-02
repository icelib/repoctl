import { Buffer } from 'node:buffer'
import { link, readFile, rename, symlink } from 'node:fs/promises'
import { applyUpgradePlan, planUpgrade } from '@icebreakers/monorepo'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { fixture, snapshot } from './fixture'

describe('upgrade plan preconditions', () => {
  it.each(['target', 'config', 'new-package', 'legacy-state'])('rejects a changed %s input before any write', async (kind) => {
    const h = await fixture()
    await h.write('.changeset/pre.json', '{"mode":"pre","tag":"beta"}')
    const plan = await planUpgrade({ cwd: h.cwd })
    if (kind === 'target') {
      await h.write('package.json', '{"name":"concurrent"}')
      await h.write('pnpm-workspace.yaml', 'packages: [different/*]\n')
    }
    else if (kind === 'config') {
      await h.write('repoctl.config.mjs', 'export default {commands:{upgrade:{core:true}}}')
    }
    else if (kind === 'new-package') {
      await h.write('packages/new/package.json', '{"name":"new","version":"1.0.0"}')
    }
    else {
      await h.write('.changeset/pre.json', '{"mode":"pre","tag":"next"}')
    }
    const before = await snapshot(h.root)
    await expect(applyUpgradePlan(h.cwd, plan)).rejects.toThrow('Upgrade conflicts')
    expect(await snapshot(h.root)).toEqual(before)
  })

  it.each(['symbolic', 'hard'])('reports %s linked targets as conflicts without changing either location', async (kind) => {
    const h = await fixture()
    const filename = path.join(h.cwd, 'package.json')
    const outside = path.join(h.root, 'original.json')
    if (kind === 'hard') {
      await link(filename, outside)
    }
    else {
      await rename(filename, outside)
      await symlink(outside, filename)
    }
    const before = await snapshot(h.root)
    const plan = await planUpgrade({ cwd: h.cwd })
    expect(plan.status).toBe('blocked')
    expect(plan.files.find(file => file.path === 'package.json')?.status).toBe('conflict')
    await expect(applyUpgradePlan(h.cwd, plan)).rejects.toThrow('blocked')
    expect(await snapshot(h.root)).toEqual(before)
  })

  it('rejects partial application and malformed or altered serialized content', async () => {
    const h = await fixture()
    const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig', 'Dockerfile'] })
    const before = await snapshot(h.root)
    const altered = structuredClone(plan)
    altered.files[0]!.content = 'dGFtcGVyZWQ='
    await expect(applyUpgradePlan(h.cwd, altered)).rejects.toThrow('Invalid upgrade content')
    const malformed = JSON.parse(JSON.stringify(plan))
    malformed.files = [null]
    await expect(applyUpgradePlan(h.cwd, malformed)).rejects.toThrow('Invalid')
    expect(await snapshot(h.root)).toEqual(before)
    await h.write('.editorconfig', Buffer.from(plan.files.find(file => file.path === '.editorconfig')!.content!, 'base64'))
    const partial = await snapshot(h.root)
    await expect(applyUpgradePlan(h.cwd, plan)).rejects.toThrow('partially applied')
    expect(await snapshot(h.root)).toEqual(partial)
    expect(await readFile(path.join(h.cwd, 'unrelated.txt'), 'utf8')).toBe('keep exactly\n')
  })
})
