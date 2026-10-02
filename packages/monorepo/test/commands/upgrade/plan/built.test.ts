import { Buffer } from 'node:buffer'
import { readFile, writeFile } from 'node:fs/promises'
import { applyUpgradePlan, formatUpgradePlan, planUpgrade, upgradeMonorepo } from '@icebreakers/monorepo'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { cli, fixture, snapshot } from './fixture'

describe('built upgrade plans', () => {
  it('previews every semantic merge and migration without changing files, Git state or metadata', async () => {
    const h = await fixture()
    await h.write('AGENTS.md', '# Team\n\n## Team notes\n\nKeep these instructions.\n')
    await h.write('.gitignore', '# local\ncustom.cache\n')
    await h.write('.changeset/config.json', '{"changelog":"legacy"}\n')
    await h.write('.changeset/pre.json', '{"mode":"pre","tag":"beta"}\n')
    const before = await snapshot(h.root)
    const plan = await planUpgrade({ cwd: h.cwd })
    expect(plan.status, JSON.stringify(plan.blockers)).toBe('ready')
    expect(await upgradeMonorepo({ cwd: h.cwd, dryRun: true })).toEqual(plan)
    expect(plan.files.find(file => file.path === 'package.json')).toMatchObject({ status: 'modify', reason: 'package-semantic-merge', group: 'legacy-versioning' })
    expect(plan.files.find(file => file.path === 'pnpm-workspace.yaml')).toMatchObject({ status: 'modify', reason: 'legacy-lane-migration', group: 'legacy-versioning' })
    expect(plan.files.find(file => file.path === '.changeset/pre.json')).toMatchObject({ status: 'delete', group: 'legacy-versioning' })
    expect(plan.files.find(file => file.path === '.changeset/config.json')?.status).toBe('delete')
    expect(plan.files.find(file => file.path === 'AGENTS.md')?.diff).toContain('Keep these instructions.')
    expect(plan.files.find(file => file.path === '.gitignore')?.diff).toContain('custom.cache')
    expect(plan.files.find(file => file.path === 'Dockerfile')?.status).toBe('add')
    expect(formatUpgradePlan(plan)).toContain('--- a/package.json')
    expect(formatUpgradePlan(plan, 'markdown')).toContain('````diff')
    const json = cli(h.cwd, ['--dry-run', '--json'])
    expect(json.status, json.stderr).toBe(0)
    expect(JSON.parse(json.stdout)).toEqual(plan)
    expect(cli(h.cwd, ['--markdown']).stdout).toContain('legacy-lane-migration')
    expect(await snapshot(h.root)).toEqual(before)
    await expect(applyUpgradePlan(h.cwd, plan, { files: ['.changeset/pre.json'] })).rejects.toThrow('migration group')
    const result = await applyUpgradePlan(h.cwd, JSON.parse(JSON.stringify(plan)))
    expect(result.status).toBe('applied')
    const after = await snapshot(h.root)
    for (const file of plan.files.filter(file => ['add', 'modify'].includes(file.status))) {
      expect(await readFile(path.join(h.cwd, file.path))).toEqual(Buffer.from(file.content!, 'base64'))
    }
    expect(await readFile(path.join(h.cwd, 'pnpm-workspace.yaml'), 'utf8')).toContain('a: beta')
    expect(await readFile(path.join(h.cwd, 'pnpm-workspace.yaml'), 'utf8')).not.toContain('private: beta')
    expect(after['workspace/unrelated.txt']).toBe(before['workspace/unrelated.txt'])
    expect(Object.fromEntries(Object.entries(after).filter(([key]) => key.startsWith('workspace/.git/')))).toEqual(Object.fromEntries(Object.entries(before).filter(([key]) => key.startsWith('workspace/.git/'))))
    expect(await applyUpgradePlan(h.cwd, plan)).toEqual({ status: 'unchanged', changed: [] })
    expect(await snapshot(h.root)).toEqual(after)
    expect((await planUpgrade({ cwd: h.cwd })).files.filter(file => ['add', 'modify', 'delete'].includes(file.status))).toEqual([])
  })

  it('preserves core, no-overwrite, licenses and custom release workflows while honoring explicit release replacement', async () => {
    const h = await fixture()
    await h.write('.github/workflows/release.yml', 'name: custom\njobs: {}\n')
    await h.write('LICENSE', 'custom license\n')
    await h.write('Dockerfile', 'custom docker\n')
    await h.write('.changeset/pre.json', '{"mode":"pre","tag":"beta"}\n')
    await h.write('.changeset/config.json', '{}\n')
    const core = await planUpgrade({ cwd: h.cwd, core: true })
    expect(core.files.some(file => file.path.startsWith('.github/'))).toBe(false)
    const preserved = await planUpgrade({ cwd: h.cwd, noOverwrite: true })
    for (const name of ['Dockerfile', '.changeset/pre.json', '.changeset/config.json', 'LICENSE']) {
      expect(preserved.files.find(file => file.path === name)?.status).toBe('skip')
    }
    expect(preserved.files.find(file => file.path === '.github/workflows/release.yml')).toMatchObject({ status: 'skip', reason: 'overwrite-disabled' })
    const ordinary = await planUpgrade({ cwd: h.cwd })
    expect(ordinary.files.find(file => file.path === '.github/workflows/release.yml')?.reason).toBe('custom-release-protected')
    const forced = await planUpgrade({ cwd: h.cwd, noOverwrite: true, overwriteRelease: true })
    expect(forced.files.find(file => file.path === '.github/workflows/release.yml')).toMatchObject({ status: 'modify', automatic: true })
    expect(forced.files.find(file => file.path === 'Dockerfile')?.status).toBe('skip')
    const cliPlan = cli(h.cwd, ['--json', '--yes', '--no-overwrite'])
    expect(JSON.parse(cliPlan.stdout).files.find((file: { path: string }) => file.path === 'Dockerfile').status).toBe('skip')
  })

  it('marks binary diffs explicitly and applies saved CLI plans with the workspace alias', async () => {
    const h = await fixture()
    await h.write('.editorconfig', Buffer.from([0, 255, 1, 2]))
    const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'], overwrite: true })
    expect(plan.files[0]).toMatchObject({ binary: true, diff: null, status: 'modify' })
    expect(formatUpgradePlan(plan)).toContain('Binary file')
    const filename = path.join(h.root, 'reviewed.json')
    await writeFile(filename, JSON.stringify(plan))
    const result = cli(h.cwd, ['--apply', filename, '--json'], ['workspace', 'up'])
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ status: 'applied', changed: ['.editorconfig', plan.files[0]!.baseline!.path] })
  })

  it('previews a missing output directory and retains unknown prerelease state', async () => {
    const h = await fixture()
    await h.write('.changeset/pre.json', '{bad json')
    await h.write('.changeset/config.json', '{}')
    const before = await snapshot(h.root)
    const plan = await planUpgrade({ cwd: h.cwd, outDir: 'missing/output' })
    expect(plan.status).toBe('ready')
    expect(plan.files.find(file => file.path === 'package.json')).toMatchObject({ status: 'skip', reason: 'root-package-required' })
    const original = await planUpgrade({ cwd: h.cwd })
    expect(original.files.find(file => file.path === '.changeset/pre.json')).toMatchObject({ status: 'skip', reason: 'prerelease-state-retained' })
    expect(original.files.find(file => file.path === '.changeset/config.json')?.status).toBe('skip')
    expect(await snapshot(h.root)).toEqual(before)
  })

  it('reloads explicit target selection and script overrides when a new plan is requested', async () => {
    const h = await fixture()
    await h.write('repoctl.config.mjs', 'export default await Promise.resolve({extends:"./base.config.mjs",commands:{upgrade:{targets:["package.json"],mergeTargets:false}}})')
    await h.write('base.config.mjs', 'export default {commands:{upgrade:{scripts:{verify:"echo custom"}}}}')
    const first = await planUpgrade({ cwd: h.cwd })
    expect(first.targets).toEqual(['package.json'])
    expect(first.files).toHaveLength(1)
    expect(Buffer.from(first.files[0]!.content!, 'base64').toString()).toContain('echo custom')
    await h.write('repoctl.config.mjs', 'export default async () => ({extends:"./base.config.mjs",commands:{upgrade:{targets:["Dockerfile"],mergeTargets:false}}})')
    const second = await planUpgrade({ cwd: h.cwd })
    expect(second.targets).toEqual(['Dockerfile'])
    expect(second.files.map(file => file.path)).toEqual(['Dockerfile'])
    await h.write('base.config.mjs', 'export default {commands:{upgrade:{scripts:{verify:"echo refreshed"}}}}')
    const third = await planUpgrade({ cwd: h.cwd, targets: ['package.json'] })
    expect(Buffer.from(third.files[0]!.content!, 'base64').toString()).toContain('echo refreshed')
    await expect(applyUpgradePlan(h.cwd, second)).rejects.toThrow('Upgrade conflicts')
  })

  it('does not split a migration group during ordinary noninteractive upgrades', async () => {
    const h = await fixture()
    await h.write('.changeset/pre.json', '{"mode":"pre","tag":"beta"}')
    await h.write('.changeset/config.json', '{}')
    const before = await readFile(path.join(h.cwd, 'pnpm-workspace.yaml'), 'utf8')
    const result = cli(h.cwd, [])
    expect(result.status, result.stderr).toBe(0)
    expect(await readFile(path.join(h.cwd, '.changeset/pre.json'), 'utf8')).toContain('beta')
    expect(await readFile(path.join(h.cwd, '.changeset/config.json'), 'utf8')).toBe('{}')
    expect(await readFile(path.join(h.cwd, 'pnpm-workspace.yaml'), 'utf8')).toBe(before)
  })

  it('explains omitted large-text diffs and exposes both public CLI help routes', async () => {
    const h = await fixture()
    await h.write('.editorconfig', 'x'.repeat(300000))
    const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'], overwrite: true })
    expect(plan.files[0]).toMatchObject({ binary: false, diff: null })
    expect(formatUpgradePlan(plan)).toContain('exceeds the display limit')
    for (const command of [['upgrade'], ['workspace', 'up']]) {
      const help = cli(h.cwd, ['--help'], command)
      expect(help.status).toBe(0)
      for (const flag of ['--dry-run', '--json', '--markdown', '--apply']) {
        expect(help.stdout).toContain(flag)
      }
    }
  })
})
