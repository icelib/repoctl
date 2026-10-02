import type { DoctorReport } from '@/commands/doctor'
import { spawnSync } from 'node:child_process'
import { chmod, readdir, readFile, realpath } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import fs from '@/utils/fs'
import { createTempWorkspace, recordInstallation } from './helpers'

const cli = fileURLToPath(new URL('../../../bin/repoctl.js', import.meta.url))

async function fixture() {
  const root = await createTempWorkspace('repoctl doctor built ')
  await fs.outputJson(path.join(root, 'package.json'), {
    private: true,
    name: 'doctor-built',
    engines: { node: '>=22' },
    devDependencies: { repoctl: '^3.0.0' },
  })
  await fs.outputFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: [packages/*]\n')
  await fs.outputJson(path.join(root, 'packages/demo/package.json'), { name: 'demo', private: true })
  await recordInstallation(root)
  return root
}

function invoke(root: string, lang = 'en', markdown = false, env: NodeJS.ProcessEnv = {}) {
  const childEnv = { ...process.env }
  // Windows compares environment names case-insensitively. Remove inherited
  // aliases before overriding/deleting a value; undefined alone leaves aliases.
  for (const layer of [{ CI: 'true', NODE_ENV: 'production', TEST: undefined, CONSOLA_LEVEL: '3', npm_config_user_agent: 'pnpm/12.8.1 npm/? node/v24', npm_execpath: '/fixture/pnpm.cjs' }, env]) {
    for (const [key, value] of Object.entries(layer)) {
      for (const inherited of Object.keys(childEnv)) {
        if (inherited.toLowerCase() === key.toLowerCase()) {
          delete childEnv[inherited]
        }
      }
      if (value !== undefined) {
        childEnv[key] = value
      }
    }
  }
  const result = spawnSync(process.execPath, [cli, '--lang', lang, 'doctor', markdown ? '--markdown' : '--json'], {
    cwd: path.join(root, 'packages/demo'),
    encoding: 'utf8',
    env: childEnv,
    timeout: 30000,
  })
  if (result.error || !result.stdout) {
    throw result.error ?? new Error(`CLI exited ${result.status}: ${result.stderr}`)
  }
  return result.stdout
}

function report(root: string) {
  return JSON.parse(invoke(root)) as DoctorReport
}

function check(data: DoctorReport, id: string) {
  const found = data.checks.find(check => check.id === id)
  expect(found).toBeDefined()
  return found!
}

async function contents(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name)
    if (entry.isDirectory()) {
      for (const [name, content] of Object.entries(await contents(absolute))) {
        files[`${entry.name}/${name}`] = content
      }
    }
    else {
      files[entry.name] = await readFile(absolute, 'utf8')
    }
  }
  return files
}

describe('built doctor runtime and installation diagnostics', () => {
  it('runs from a child directory with spaces, preserves files, and keeps locale-independent IDs and report fields', async () => {
    const root = await fixture()
    const before = await contents(root)
    const result = report(root)
    expect(path.normalize(result.workspaceDir)).toBe(path.normalize(await realpath(root)))
    expect(result).toMatchObject({ packageCount: 1, cwd: expect.any(String), summary: expect.any(Object) })
    for (const id of ['node-version', 'node-version-files', 'package-manager', 'pnpm-version', 'lockfile-sync', 'installation-state']) {
      expect(check(result, id).status).toBe('pass')
    }
    expect(check(result, 'pnpm-version').detail).toContain('inherited launch evidence')
    const chinese = JSON.parse(invoke(root, 'zh-CN')) as DoctorReport
    expect(chinese.checks.map(({ id, status }) => ({ id, status }))).toEqual(result.checks.map(({ id, status }) => ({ id, status })))
    expect(invoke(root, 'en', true)).toContain('Recorded installation state')
    expect(await contents(root)).toEqual(before)
  })

  it('does not execute a Corepack shim and distinguishes unknown from missing pnpm', async () => {
    const root = await fixture()
    const bin = path.join(root, 'corepack/bin')
    await fs.outputJson(path.join(root, 'corepack/package.json'), { name: 'corepack', version: '0.34.0' })
    const launcher = path.join(bin, process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')
    await fs.outputFile(launcher, '#!/bin/sh\necho unexpectedly-executed > should-not-exist\n')
    await chmod(launcher, 0o755)
    const env = { PATH: bin, npm_config_user_agent: undefined, npm_execpath: undefined }
    const before = await contents(root)
    const unknown = JSON.parse(invoke(root, 'en', false, env)) as DoctorReport
    expect(check(unknown, 'pnpm-version')).toMatchObject({ status: 'warn', detail: expect.stringContaining('Corepack shim') })
    const missing = JSON.parse(invoke(root, 'en', false, { ...env, PATH: path.join(root, 'empty') })) as DoctorReport
    expect(check(missing, 'pnpm-version')).toMatchObject({ status: 'fail', detail: expect.stringContaining('missing from PATH') })
    expect(await contents(root)).toEqual(before)
  })

  it('reads a PATH pnpm package without invoking it', async () => {
    const root = await fixture()
    const bin = path.join(root, 'pnpm/bin')
    await fs.outputJson(path.join(root, 'pnpm/package.json'), { name: 'pnpm', version: '12.8.1' })
    const launcher = path.join(bin, process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')
    await fs.outputFile(launcher, '#!/bin/sh\nexit 42\n')
    await chmod(launcher, 0o755)
    const result = JSON.parse(invoke(root, 'en', false, { PATH: bin, npm_config_user_agent: undefined, npm_execpath: undefined })) as DoctorReport
    expect(check(result, 'pnpm-version')).toMatchObject({ status: 'pass', detail: expect.stringContaining('PATH package metadata') })
  })

  it('reports conflicting Node declarations and pnpm versions in the same workspace', async () => {
    const root = await fixture()
    const manifest = await fs.readJson(path.join(root, 'package.json'))
    await fs.writeJson(path.join(root, 'package.json'), { ...manifest, engines: { node: '>=999' }, packageManager: 'pnpm@11.22.0' })
    await fs.writeFile(path.join(root, '.nvmrc'), '20\n')
    await fs.writeFile(path.join(root, '.node-version'), '22.13.0\n')
    const result = report(root)
    for (const id of ['node-version', 'node-version-files', 'pnpm-version', 'installation-state']) {
      expect(check(result, id)).toMatchObject({ status: 'fail', fix: expect.any(String) })
    }
    expect(check(result, 'node-version-files').detail).toContain('.nvmrc / .node-version')
  })

  it('keeps unresolved Node aliases unknown and accepts missing version files', async () => {
    const root = await fixture()
    await fs.writeFile(path.join(root, '.nvmrc'), 'lts/*\n')
    expect(check(report(root), 'node-version-files').status).toBe('warn')
  })

  it('distinguishes no installation, unsupported metadata, and stale manifests', async () => {
    const root = await fixture()
    await fs.remove(path.join(root, 'node_modules'))
    expect(check(report(root), 'installation-state')).toMatchObject({ status: 'warn', detail: expect.stringContaining('No root node_modules') })
    await fs.ensureDir(path.join(root, 'node_modules'))
    expect(check(report(root), 'installation-state')).toMatchObject({ status: 'warn', detail: expect.stringContaining('unknown') })
    await recordInstallation(root)
    const manifest = await fs.readJson(path.join(root, 'package.json'))
    await fs.writeJson(path.join(root, 'package.json'), { ...manifest, dependencies: { added: '^1.0.0' } })
    expect(check(report(root), 'lockfile-sync')).toMatchObject({ status: 'fail', detail: expect.stringContaining('dependencies.added') })
  })

  it('detects a stale installed lockfile and missing installed direct dependencies', async () => {
    const root = await fixture()
    const installed = path.join(root, 'node_modules/.pnpm/lock.yaml')
    const lockfile = await fs.readJson(installed)
    await fs.writeJson(installed, { ...lockfile, snapshots: { 'stale@1.0.0': {} } })
    expect(check(report(root), 'installation-state')).toMatchObject({ status: 'fail', detail: expect.stringContaining('snapshots') })
    await recordInstallation(root)
    await fs.remove(path.join(root, 'node_modules/repoctl'))
    expect(check(report(root), 'installation-state')).toMatchObject({ status: 'fail', detail: expect.stringContaining('direct dependency is missing') })
  })

  it('reads the dependency document in a pnpm 12 multi-document lockfile', async () => {
    const root = await fixture()
    const lockPath = path.join(root, 'pnpm-lock.yaml')
    const existing = await fs.readFile(lockPath, 'utf8')
    await fs.writeFile(lockPath, `---\nlockfileVersion: '9.0'\nimporters:\n  .:\n    packageManagerDependencies: {}\n---\n${existing}`)
    expect(check(report(root), 'lockfile-sync').status).toBe('pass')
    expect(check(report(root), 'installation-state').status).toBe('pass')
  })

  it.each(['hoisted', 'pnp'])('keeps a %s installation unknown instead of reporting missing child dependencies', async (nodeLinker) => {
    const root = await fixture()
    await fs.outputJson(path.join(root, 'packages/demo/package.json'), { name: 'demo', dependencies: { dep: '^1.0.0' } })
    const lockfile = await fs.readJson(path.join(root, 'pnpm-lock.yaml'))
    lockfile.importers['packages/demo'] = { dependencies: { dep: { specifier: '^1.0.0', version: '1.0.0' } } }
    await fs.writeJson(path.join(root, 'pnpm-lock.yaml'), lockfile)
    await fs.writeJson(path.join(root, 'node_modules/.pnpm/lock.yaml'), lockfile)
    await fs.outputJson(path.join(root, 'node_modules/dep/package.json'), { name: 'dep', version: '1.0.0' })
    const metadataPath = path.join(root, 'node_modules/.modules.yaml')
    const metadata = await fs.readJson(metadataPath)
    await fs.writeJson(metadataPath, { ...metadata, nodeLinker })
    expect(check(report(root), 'installation-state')).toMatchObject({ status: 'warn', detail: expect.stringContaining('only the isolated') })
  })

  it('detects a changed auto-installed peer declaration even when both lockfiles agree', async () => {
    const root = await fixture()
    const manifest = await fs.readJson(path.join(root, 'package.json'))
    await fs.writeJson(path.join(root, 'package.json'), { ...manifest, peerDependencies: { dep: '^2.0.0' } })
    const lockfile = await fs.readJson(path.join(root, 'pnpm-lock.yaml'))
    lockfile.settings = { autoInstallPeers: true }
    lockfile.importers['.'].dependencies = { dep: { specifier: '^1.0.0', version: '1.0.0' } }
    await fs.writeJson(path.join(root, 'pnpm-lock.yaml'), lockfile)
    await fs.writeJson(path.join(root, 'node_modules/.pnpm/lock.yaml'), lockfile)
    await fs.outputJson(path.join(root, 'node_modules/dep/package.json'), { name: 'dep', version: '1.0.0' })
    expect(check(report(root), 'lockfile-sync')).toMatchObject({ status: 'fail', detail: expect.stringContaining('dependencies.dep') })
    expect(check(report(root), 'installation-state').status).toBe('fail')
  })

  it('does not pass changed overrides when the old manifest and both lockfiles still agree', async () => {
    const root = await fixture()
    const manifest = await fs.readJson(path.join(root, 'package.json'))
    await fs.writeJson(path.join(root, 'package.json'), { ...manifest, dependencies: { dep: '^1.0.0' } })
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: [packages/*]\noverrides: { dep: ^2.0.0 }\n')
    const lockfile = await fs.readJson(path.join(root, 'pnpm-lock.yaml'))
    lockfile.overrides = { dep: '^1.0.0' }
    lockfile.importers['.'].dependencies = { dep: { specifier: '^1.0.0', version: '1.0.0' } }
    await fs.writeJson(path.join(root, 'pnpm-lock.yaml'), lockfile)
    await fs.writeJson(path.join(root, 'node_modules/.pnpm/lock.yaml'), lockfile)
    await fs.outputJson(path.join(root, 'node_modules/dep/package.json'), { name: 'dep', version: '1.0.0' })
    expect(check(report(root), 'lockfile-sync')).toMatchObject({ status: 'warn', detail: expect.stringContaining('overrides differ') })
    expect(check(report(root), 'installation-state').status).toBe('warn')
  })

  it('keeps pnpmfile transformations unknown without executing the hook', async () => {
    const root = await fixture()
    await fs.writeFile(path.join(root, '.pnpmfile.cjs'), 'throw new Error("Doctor must never execute this hook")\n')
    expect(check(report(root), 'lockfile-sync')).toMatchObject({ status: 'warn', detail: expect.stringContaining('transformations') })
    expect(check(report(root), 'installation-state').status).toBe('warn')
  })

  it('reports unsupported lockfiles and partial installs as unknown', async () => {
    const root = await fixture()
    await fs.writeFile(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: \'99.0\'\nimporters: { .: {} }')
    expect(check(report(root), 'lockfile-sync').status).toBe('warn')
    expect(check(report(root), 'installation-state').status).toBe('warn')
    await recordInstallation(root)
    const metadataPath = path.join(root, 'node_modules/.modules.yaml')
    const metadata = await fs.readJson(metadataPath)
    await fs.writeJson(metadataPath, { ...metadata, included: { ...metadata.included, devDependencies: false } })
    expect(check(report(root), 'installation-state')).toMatchObject({ status: 'warn', detail: expect.stringContaining('partial') })
  })
})
