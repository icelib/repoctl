import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { applyUpgradePlan, loadMonorepoConfigDetails, planUpgrade, runDoctor, upgradeMonorepo } from 'repoctl'
import { afterEach, describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { cliBin, defaultConfig, git, initializeGit, run, temporaryDirectory, write } from './helpers'

const directories: string[] = []
const targets = ['lefthook.yml', 'package.json', 'pnpm-workspace.yaml', 'repoctl.config.ts']

function legacyRepository() {
  const cwd = temporaryDirectory()
  directories.push(cwd)
  initializeGit(cwd)
  write(cwd, 'package.json', JSON.stringify({
    name: 'legacy-hooks',
    private: true,
    scripts: { prepare: 'husky', custom: 'echo keep' },
    devDependencies: { 'repoctl': '^5.5.5', 'husky': '^9.1.7', 'lint-staged': '^17.5.1' },
  }))
  write(cwd, 'pnpm-workspace.yaml', 'packages:\n  - packages/*\nallowBuilds:\n  esbuild: true\n')
  write(cwd, 'repoctl.config.ts', `export default {
    commands: { upgrade: { targets: ${JSON.stringify(targets)}, mergeTargets: false } },
    tooling: { eslint: { ignores: ['keep/**'] }, lintStaged: { repoCommand: 'pnpm exec repo' } },
  }\n`)
  write(cwd, '.husky/pre-commit', '#!/usr/bin/env sh\nset -e\npnpm exec repo verify pre-commit\n')
  write(cwd, '.husky/commit-msg', 'pnpm exec repo verify commit-msg "$1"\n')
  write(cwd, '.husky/pre-push', 'pnpm lint\npnpm typecheck\n')
  write(cwd, '.husky/_/h', 'generated Husky shim\n')
  write(cwd, 'lint-staged.config.js', 'import { defineLintStagedConfig } from \'repoctl/tooling\'\n\nexport default await defineLintStagedConfig()\n')
  git(cwd, 'config', 'core.hooksPath', '.husky/_')
  return cwd
}

afterEach(() => {
  for (const cwd of directories.splice(0)) {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
})

describe('built repoctl hook upgrades', () => {
  it('migrates the default setup together and remains idempotent', async () => {
    const cwd = legacyRepository()
    const preview = await planUpgrade({ cwd, yes: true })
    const workspacePlan = preview.files.find(file => file.path === 'pnpm-workspace.yaml')!
    const deferred = workspacePlan.workspacePolicy!.findings.filter(finding => finding.status === 'deferred')
    expect(workspacePlan.automatic).toBe(true)
    expect(deferred.map(finding => finding.path[1])).toContain('@arethetypeswrong/core>typescript')
    await upgradeMonorepo({ cwd, yes: true })
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'))
    expect(pkg.devDependencies.lefthook).toBe('2.2.2')
    expect(pkg.devDependencies.husky).toBeUndefined()
    expect(pkg.devDependencies['lint-staged']).toBeUndefined()
    expect(pkg.scripts.prepare).toBeUndefined()
    expect(pkg.scripts.custom).toBe('echo keep')
    expect(fs.readFileSync(path.join(cwd, 'lefthook.yml'), 'utf8')).toBe(defaultConfig)
    expect(fs.existsSync(path.join(cwd, '.husky/pre-commit'))).toBe(false)
    expect(fs.existsSync(path.join(cwd, '.husky/_'))).toBe(false)
    expect(fs.existsSync(path.join(cwd, 'lint-staged.config.js'))).toBe(false)
    expect(run(cwd, 'git', ['config', '--local', '--get', 'core.hooksPath']).status).toBe(1)
    const config = fs.readFileSync(path.join(cwd, 'repoctl.config.ts'), 'utf8')
    expect(config).toContain('keep/**')
    expect(config).not.toContain('lintStaged')
    const workspace = YAML.parse(fs.readFileSync(path.join(cwd, 'pnpm-workspace.yaml'), 'utf8'))
    expect(workspace.allowBuilds).toMatchObject({ esbuild: true, lefthook: true })
    for (const finding of deferred) {
      expect(Object.hasOwn(workspace.overrides, finding.path[1])).toBe(false)
    }
    const nextPreview = await planUpgrade({ cwd, yes: true })
    expect(nextPreview.files.find(file => file.path === 'pnpm-workspace.yaml')).toMatchObject({ automatic: false })
    expect(nextPreview.files.find(file => file.path === 'pnpm-workspace.yaml')!.workspacePolicy!.findings.map(finding => finding.status)).toEqual(deferred.map(() => 'unverified'))
    await applyUpgradePlan(cwd, nextPreview)
    const reviewedWorkspace = YAML.parse(fs.readFileSync(path.join(cwd, 'pnpm-workspace.yaml'), 'utf8'))
    for (const finding of deferred) {
      expect(Object.hasOwn(reviewedWorkspace.overrides, finding.path[1])).toBe(true)
    }
    await upgradeMonorepo({ cwd, yes: true, noOverwrite: true })
    const doctor = await runDoctor(cwd)
    expect(doctor.checks.find(check => check.id === 'commit-hooks')?.status).toBe('pass')
  })

  it('preserves the whole hook setup when a workspace conflict blocks its migration group', async () => {
    const cwd = legacyRepository()
    write(cwd, 'packages/taro/package.json', '{"name":"taro","devDependencies":{"vite":"^4.5.0"}}')
    const plan = await planUpgrade({ cwd, yes: true })
    const workspace = plan.files.find(file => file.path === 'pnpm-workspace.yaml')!
    expect(workspace).toMatchObject({ status: 'conflict', group: 'lefthook-migration', reason: 'workspace-override-policy' })
    const group = plan.files.filter(file => file.group === workspace.group)
    const before = group.map(file => ({ path: file.path, content: fs.existsSync(path.join(cwd, file.path)) ? fs.readFileSync(path.join(cwd, file.path), 'utf8') : null }))
    expect(await applyUpgradePlan(cwd, plan)).toMatchObject({ status: 'unchanged', conflicts: ['pnpm-workspace.yaml'] })
    await expect(applyUpgradePlan(cwd, plan, { files: group.filter(file => file.status !== 'conflict').map(file => file.path) })).rejects.toThrow('Resolve every blocked file in migration group')
    await expect(applyUpgradePlan(cwd, plan, { files: ['lefthook.yml'] })).rejects.toThrow('Resolve every blocked file in migration group')
    await expect(upgradeMonorepo({ cwd, yes: true })).rejects.toThrow('Unresolved upgrade conflicts')
    for (const file of before) {
      expect(fs.existsSync(path.join(cwd, file.path)) ? fs.readFileSync(path.join(cwd, file.path), 'utf8') : null).toBe(file.content)
    }
    expect(fs.existsSync(path.join(cwd, '.repoctl/baselines'))).toBe(false)
    expect(git(cwd, 'config', '--local', '--get', 'core.hooksPath')).toBe('.husky/_')
  })

  it.each(['preset-owned', 'deleted'])('preserves the complete setup when a required hook target is %s', async (kind) => {
    const cwd = legacyRepository()
    const initial = await planUpgrade({ cwd, yes: true })
    const baseline = initial.files.find(file => file.path === 'lefthook.yml')!.baseline!
    const record = JSON.parse(Buffer.from(baseline.content!, 'base64').toString())
    const filename = kind === 'deleted' ? baseline.path : baseline.path.replace('/root/', '/presets/')
    if (kind === 'preset-owned') {
      write(cwd, 'lefthook.yml', defaultConfig)
      record.source = { packageName: '@company/preset', version: '1.0.0', path: 'assets/lefthook.yml' }
    }
    const originalRecord = JSON.stringify(record)
    write(cwd, filename, originalRecord)
    const plan = await planUpgrade({ cwd, yes: true })
    expect(plan.status, JSON.stringify(plan.blockers)).toBe('ready')
    expect(plan.files.find(file => file.path === 'lefthook.yml')).toMatchObject({
      status: kind === 'deleted' ? 'skip' : 'conflict',
      reason: kind === 'deleted' ? 'user-deletion-preserved' : 'preset-owned-asset',
      group: 'lefthook-migration',
    })
    const group = plan.files.filter(file => file.group === 'lefthook-migration')
    const before = group.map(file => ({ path: file.path, content: fs.existsSync(path.join(cwd, file.path)) ? fs.readFileSync(path.join(cwd, file.path), 'utf8') : null }))
    expect(await applyUpgradePlan(cwd, plan)).toMatchObject({ status: 'unchanged', changed: [] })
    await expect(applyUpgradePlan(cwd, plan, { files: group.filter(file => ['add', 'modify', 'delete'].includes(file.status) || file.baseline).map(file => file.path) })).rejects.toThrow('Resolve every blocked file in migration group')
    await expect(applyUpgradePlan(cwd, plan, { files: ['package.json'] })).rejects.toThrow('Resolve every blocked file in migration group')
    if (kind === 'preset-owned') {
      await expect(upgradeMonorepo({ cwd, yes: true })).rejects.toThrow('Unresolved upgrade conflicts')
    }
    else {
      await upgradeMonorepo({ cwd, yes: true })
    }
    for (const file of before) {
      expect(fs.existsSync(path.join(cwd, file.path)) ? fs.readFileSync(path.join(cwd, file.path), 'utf8') : null).toBe(file.content)
    }
    expect(fs.readFileSync(path.join(cwd, filename), 'utf8')).toBe(originalRecord)
    expect(git(cwd, 'config', '--local', '--get', 'core.hooksPath')).toBe('.husky/_')
  })

  it.each([{ noOverwrite: true }, { skipOverwrite: true }])('keeps the old setup whole when overwrites are disabled: %j', async (options) => {
    const cwd = legacyRepository()
    const before = fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')
    await upgradeMonorepo({ cwd, yes: true, ...options })
    expect(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')).toBe(before)
    expect(fs.existsSync(path.join(cwd, 'lefthook.yml'))).toBe(false)
    expect(fs.existsSync(path.join(cwd, '.husky/pre-commit'))).toBe(true)
    expect(fs.existsSync(path.join(cwd, 'lint-staged.config.js'))).toBe(true)
    expect(git(cwd, 'config', '--local', '--get', 'core.hooksPath')).toBe('.husky/_')
  })

  it.each(['hook', 'staged-config', 'alternate-config', 'prepare', 'prepare-file', 'tooling', 'quoted-tooling'])('preserves custom %s and reports manual migration', async (kind) => {
    const cwd = legacyRepository()
    if (kind === 'hook') {
      write(cwd, '.husky/pre-commit', 'node custom-check.cjs\n')
    }
    if (kind === 'staged-config') {
      write(cwd, 'lint-staged.config.js', 'export default { \'*.ts\': \'custom-check\' }\n')
    }
    if (kind === 'alternate-config') {
      fs.rmSync(path.join(cwd, 'lint-staged.config.js'))
      write(cwd, '.lintstagedrc.cjs', 'module.exports = { \'*.ts\': \'company-check\' }\n')
    }
    if (kind === 'prepare' || kind === 'prepare-file') {
      const file = path.join(cwd, 'package.json')
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
      pkg.scripts.prepare = kind === 'prepare' ? 'husky && node custom-prepare.cjs' : 'node custom-prepare.cjs'
      fs.writeFileSync(file, JSON.stringify(pkg))
    }
    if (kind === 'tooling') {
      const file = path.join(cwd, 'repoctl.config.ts')
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('repoCommand: \'pnpm exec repo\'', 'repoCommand: \'custom-repo\''))
    }
    if (kind === 'quoted-tooling') {
      const file = path.join(cwd, 'repoctl.config.ts')
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('lintStaged:', '\'lintStaged\':'))
    }
    const oldConfig = fs.readFileSync(path.join(cwd, 'repoctl.config.ts'), 'utf8')
    const oldPackage = fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')
    await upgradeMonorepo({ cwd, yes: true })
    expect(fs.existsSync(path.join(cwd, 'lefthook.yml'))).toBe(false)
    expect(fs.existsSync(path.join(cwd, '.husky/pre-commit'))).toBe(true)
    expect(fs.readFileSync(path.join(cwd, 'repoctl.config.ts'), 'utf8')).toBe(oldConfig)
    expect(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')).toBe(oldPackage)
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'))
    expect(pkg.devDependencies.husky).toBe('^9.1.7')
    expect(pkg.devDependencies.lefthook).toBeUndefined()
    const doctor = await runDoctor(cwd)
    expect(doctor.checks.find(check => check.id === 'commit-hooks')?.status).toBe('warn')
  })

  it.each([false, true])('migrates the historical inline default factory with CRLF=%s', async (crlf) => {
    const cwd = legacyRepository()
    let config = fs.readFileSync(new URL('./fixtures/legacy-repoctl-config.txt', import.meta.url), 'utf8').replace('**/fixtures/**', 'keep/**')
    if (crlf) {
      config = config.replaceAll('\n', '\r\n')
    }
    write(cwd, 'repoctl.config.ts', config)
    await upgradeMonorepo({ cwd, yes: true, targets })
    const migrated = fs.readFileSync(path.join(cwd, 'repoctl.config.ts'), 'utf8')
    expect(migrated).toContain('keep/**')
    expect(migrated).not.toContain('lintStaged')
    expect(migrated).not.toContain('createLintStagedConfig')
    expect(fs.existsSync(path.join(cwd, '.husky/pre-commit'))).toBe(false)
    expect(JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')).devDependencies.lefthook).toBe('2.2.2')
  })

  it('preserves a modified inline factory for manual migration', async () => {
    const cwd = legacyRepository()
    const config = fs.readFileSync(new URL('./fixtures/legacy-repoctl-config.txt', import.meta.url), 'utf8').replace('eslint --fix', 'company-check')
    write(cwd, 'repoctl.config.ts', config)
    await upgradeMonorepo({ cwd, yes: true, targets })
    expect(fs.readFileSync(path.join(cwd, 'repoctl.config.ts'), 'utf8')).toBe(config)
    expect(fs.existsSync(path.join(cwd, 'lefthook.yml'))).toBe(false)
  })

  it('previews without writes, rejects partial groups and detects stale hook files', async () => {
    const cwd = legacyRepository()
    const oldPackage = fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')
    const plan = await planUpgrade({ cwd, yes: true })
    expect(plan.status, JSON.stringify(plan.blockers)).toBe('ready')
    expect(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')).toBe(oldPackage)
    expect(fs.existsSync(path.join(cwd, 'lefthook.yml'))).toBe(false)
    await expect(applyUpgradePlan(cwd, plan, { files: ['lefthook.yml'] })).rejects.toThrow('together')
    expect(fs.existsSync(path.join(cwd, 'lefthook.yml'))).toBe(false)
    write(cwd, '.husky/pre-commit', 'company-check\n')
    await expect(applyUpgradePlan(cwd, plan)).rejects.toThrow('regenerate the plan')
    expect(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')).toBe(oldPackage)
  })

  it('allows the real upgrade CLI to inspect removed fields without weakening ordinary validation', async () => {
    const cwd = legacyRepository()
    await runDoctor(cwd, { rules: ['commit-hooks'] })
    await expect(loadMonorepoConfigDetails(cwd)).rejects.toMatchObject({ code: 'REPOCTL_CONFIG_INVALID' })
    const result = run(cwd, process.execPath, [cliBin, 'upgrade', '--yes'])
    expect(result.status, result.output).toBe(0)
    expect(fs.existsSync(path.join(cwd, 'lefthook.yml'))).toBe(true)
    expect((await loadMonorepoConfigDetails(cwd, { refresh: true })).config.tooling?.eslint).toBeTruthy()
  })

  it('preserves unrelated local hooksPath and global configuration', async () => {
    const cwd = legacyRepository()
    git(cwd, 'config', 'core.hooksPath', 'company-hooks')
    const globalConfig = '[core]\n\thooksPath = global-hooks\n'
    write(cwd, 'global.gitconfig', globalConfig)
    await upgradeMonorepo({ cwd, yes: true })
    expect(git(cwd, 'config', '--local', '--get', 'core.hooksPath')).toBe('company-hooks')
    expect(fs.readFileSync(path.join(cwd, 'global.gitconfig'), 'utf8')).toBe(globalConfig)
    const doctor = await runDoctor(cwd)
    expect(doctor.checks.find(check => check.id === 'commit-hooks')?.status).toBe('warn')
  })

  it('preserves an existing customized native configuration', async () => {
    const cwd = legacyRepository()
    const custom = 'pre-commit:\n  jobs:\n    - run: company-check\n'
    write(cwd, 'lefthook.yml', custom)
    await upgradeMonorepo({ cwd, yes: true })
    expect(fs.readFileSync(path.join(cwd, 'lefthook.yml'), 'utf8')).toBe(custom)
    expect(fs.existsSync(path.join(cwd, '.husky/pre-commit'))).toBe(true)
  })
})
