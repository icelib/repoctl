import { Buffer } from 'node:buffer'
import { applyUpgradePlan, formatUpgradePlan, planUpgrade } from '@icebreakers/monorepo'
import { describe, expect, it } from 'vitest'
import { cli, snapshot } from '../plan/fixture'
import { baselineFixture, digest, recordPath } from './fixture'

describe('built root asset three-way upgrades', () => {
  it.each(['upstream', 'local', 'disjoint', 'same'])('merges %s edits and saves upstream bytes rather than customized output', async (kind) => {
    const h = await baselineFixture()
    const old = kind === 'local' ? h.upstream : h.upstream.replace('indent_size = 2', 'indent_size = 4')
    const local = kind === 'same' ? h.upstream : kind === 'upstream' ? old : old.replace('root = true', 'root = false')
    await h.seed('.editorconfig', old, local)
    const before = await snapshot(h.root)
    const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'] })
    expect(plan.status, JSON.stringify(plan.blockers)).toBe('ready')
    expect(await snapshot(h.root)).toEqual(before)
    const file = plan.files[0]!
    expect(file.status).toBe(['same', 'local'].includes(kind) ? 'identical' : 'modify')
    expect(file.merge?.conflicts).toEqual([])
    expect(file.baseline?.beforeHash).not.toBeNull()
    const expected = ['disjoint', 'local'].includes(kind) ? h.upstream.replace('root = true', 'root = false') : h.upstream
    await applyUpgradePlan(h.cwd, JSON.parse(JSON.stringify(plan)))
    expect(await h.read('.editorconfig')).toBe(expected)
    const record = JSON.parse(await h.read(recordPath('.editorconfig')))
    expect(Buffer.from(record.upstream.content, 'base64').toString()).toBe(h.upstream)
    expect(record.upstream.hash).toBe(digest(h.upstream))
    expect(record.source.version).not.toBe('0.0.0-fixture')
    expect(await applyUpgradePlan(h.cwd, plan)).toEqual({ status: 'unchanged', changed: [] })
    const next = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'] })
    expect(next.files[0]).toMatchObject({ status: 'identical' })
    expect(next.files[0]?.baseline).toBeUndefined()
  })

  it('reports overlapping lines with base/local/upstream content without overwriting or advancing the baseline', async () => {
    const h = await baselineFixture()
    const old = h.upstream.replace('indent_size = 2', 'indent_size = 4')
    const lineEnding = h.upstream.includes('\r\n') ? '\r\n' : '\n'
    await h.seed('.editorconfig', old, old.replace('indent_size = 4', 'indent_size = 8'))
    const before = await snapshot(h.root)
    const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'] })
    expect(plan.files[0]).toMatchObject({ status: 'conflict', reason: 'overlapping-merge-conflict' })
    expect(plan.files[0]?.baseline).toBeUndefined()
    expect(plan.files[0]?.merge?.conflicts[0]).toMatchObject({ base: `indent_size = 4${lineEnding}`, local: `indent_size = 8${lineEnding}`, upstream: `indent_size = 2${lineEnding}` })
    expect(formatUpgradePlan(plan)).toContain('<<<<<<< local')
    expect(await applyUpgradePlan(h.cwd, plan)).toEqual({ status: 'unchanged', changed: [], conflicts: ['.editorconfig'] })
    expect(await snapshot(h.root)).toEqual(before)
    await expect(applyUpgradePlan(h.cwd, plan, { files: ['.editorconfig'] })).rejects.toThrow('unplanned')
  })

  it('adopts identical untracked assets but requires explicit overwrite for differing assets', async () => {
    const h = await baselineFixture()
    await h.write('.editorconfig', 'custom configuration\n')
    const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'], yes: true })
    expect(plan.files[0]).toMatchObject({ status: 'conflict', reason: 'baseline-missing' })
    expect(plan.files[0]?.baseline).toBeUndefined()
    const forced = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'], overwrite: true })
    expect(forced.files[0]?.baseline?.beforeHash).toBeNull()
    await applyUpgradePlan(h.cwd, forced)
    expect(await h.read('.editorconfig')).toBe(h.upstream)
    const second = await baselineFixture()
    await second.write('.editorconfig', second.upstream)
    const identical = await planUpgrade({ cwd: second.cwd, targets: ['.editorconfig'] })
    expect(identical.files[0]).toMatchObject({ status: 'identical', automatic: true })
    expect(identical.files[0]?.baseline?.beforeHash).toBeNull()
    const result = await applyUpgradePlan(second.cwd, identical)
    expect(result.changed).toEqual([recordPath('.editorconfig')])
  })

  it('retains binary conflicts and preserves custom release ownership', async () => {
    const h = await baselineFixture()
    await h.seed('.editorconfig', Buffer.from([0, 1]), Buffer.from([0, 2]))
    await h.seed('.github/workflows/release.yml', 'name: old\n', 'name: custom\njobs: {}\n')
    const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig', '.github/workflows/release.yml'] })
    expect(plan.files.find(file => file.path === '.editorconfig')).toMatchObject({ status: 'conflict', reason: 'binary-merge-conflict', binary: true })
    expect(plan.files.find(file => file.path.endsWith('release.yml'))).toMatchObject({ status: 'skip', reason: 'custom-release-protected' })
    expect(plan.files.every(file => !file.baseline)).toBe(true)
  })

  it('returns a failing CLI status for unresolved preview and apply without claiming completion', async () => {
    const h = await baselineFixture()
    await h.write('.editorconfig', 'custom configuration\n')
    await h.write('repoctl.config.mjs', 'export default {commands:{upgrade:{targets:[".editorconfig"],mergeTargets:false}}}')
    const preview = cli(h.cwd, ['--json'])
    expect(preview.status).toBe(1)
    const plan = JSON.parse(preview.stdout)
    expect(plan.files[0].reason).toBe('baseline-missing')
    await h.write('reviewed.json', JSON.stringify(plan))
    const applied = cli(h.cwd, ['--apply', 'reviewed.json', '--json'])
    expect(applied.status).toBe(1)
    expect(JSON.parse(applied.stdout)).toEqual({ status: 'unchanged', changed: [], conflicts: ['.editorconfig'] })
    const ordinary = cli(h.cwd, ['--yes'])
    expect(ordinary.status).toBe(1)
    expect(ordinary.stdout).not.toContain('Upgrade finished.')
    expect(await h.read('.editorconfig')).toBe('custom configuration\n')
  })

  it('keeps semantic customizations out of the recorded upstream baseline', async () => {
    const h = await baselineFixture()
    await h.write('.gitignore', '# local rule\nmy-custom-cache\n')
    const plan = await planUpgrade({ cwd: h.cwd, targets: ['.gitignore'] })
    expect(plan.files[0]?.reason).toBe('gitignore-semantic-merge')
    await applyUpgradePlan(h.cwd, plan)
    expect(await h.read('.gitignore')).toContain('my-custom-cache')
    const record = JSON.parse(await h.read(recordPath('.gitignore')))
    expect(Buffer.from(record.upstream.content, 'base64').toString()).not.toContain('my-custom-cache')
    expect(record.source.hash).toBe(record.upstream.hash)
    expect(plan.inputs).toContainEqual({ area: 'asset', path: record.source.assetPath, hash: record.source.hash })
  })
})
