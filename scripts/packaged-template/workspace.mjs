import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import YAML from 'yaml'

export const repoRoot = path.resolve(import.meta.dirname, '../..')
export const registry = process.env.REPOCTL_SMOKE_REGISTRY ?? process.env.NIMBUS_SMOKE_REGISTRY ?? 'https://registry.npmjs.org'

export function run(command, args, cwd) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      timeout: 240_000,
      env: { ...process.env, CI: 'true', HUSKY: '0', TURBO_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  }
  catch (error) {
    throw new Error(`${command} ${args.join(' ')}\n${error.stdout ?? ''}\n${error.stderr ?? ''}`, { cause: error })
  }
}

export function json(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

export function writeJson(file, data) {
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
}

export function packDependencies(packDir) {
  const packages = new Map(readdirSync(path.join(repoRoot, 'packages')).flatMap((dir) => {
    const manifest = json(path.join(repoRoot, 'packages', dir, 'package.json'))
    return [[manifest.name, manifest]]
  }))
  const overrides = {}
  const visit = (name) => {
    if (overrides[name]) {
      return
    }
    const manifest = packages.get(name)
    assert.ok(manifest, `local package ${name} exists`)
    const before = new Set(readdirSync(packDir))
    run('pnpm', ['--filter', name, 'pack', '--pack-destination', packDir], repoRoot)
    const files = readdirSync(packDir).filter(file => file.endsWith('.tgz') && !before.has(file))
    assert.equal(files.length, 1)
    overrides[name] = `file:${path.join(packDir, files[0])}`
    for (const [dependency, version] of Object.entries(manifest.dependencies ?? {})) {
      if (String(version).startsWith('workspace:')) {
        visit(dependency)
      }
    }
  }
  visit('repoctl')
  visit('create-repoctl')
  return overrides
}

export function createWorkspace(tempRoot, templateKeys = ['nimbus', 'vitepress']) {
  const packDir = path.join(tempRoot, 'packs')
  const bootstrap = path.join(tempRoot, 'bootstrap')
  mkdirSync(packDir)
  mkdirSync(bootstrap)
  console.log('Packing CLI, templates and local runtime dependencies…')
  const overrides = packDependencies(packDir)
  const packageManager = json(path.join(repoRoot, 'package.json')).packageManager
  writeJson(path.join(bootstrap, 'package.json'), {
    name: 'repoctl-template-bootstrap',
    private: true,
    packageManager,
    dependencies: { 'create-repoctl': overrides['create-repoctl'] },
  })
  const sourceWorkspace = YAML.parse(readFileSync(path.join(repoRoot, 'pnpm-workspace.yaml'), 'utf8'))
  writeFileSync(path.join(bootstrap, 'pnpm-workspace.yaml'), YAML.stringify({
    packages: [],
    overrides: { ...sourceWorkspace.overrides, ...overrides },
  }))
  run('corepack', ['enable'], bootstrap)
  run('pnpm', ['install', '--ignore-scripts', '--registry', registry], bootstrap)

  const workspace = path.join(tempRoot, 'workspace')
  const cli = path.join(bootstrap, 'node_modules/create-repoctl/bin/create-repoctl.js')
  run(process.execPath, [cli, workspace, '--yes', '--templates', templateKeys.join(',')], bootstrap)
  const workspaceFile = path.join(workspace, 'pnpm-workspace.yaml')
  const manifest = YAML.parse(readFileSync(workspaceFile, 'utf8'))
  manifest.overrides = { ...manifest.overrides, ...overrides }
  writeFileSync(workspaceFile, YAML.stringify(manifest))
  console.log('Installing the generated workspace without source-tree links…')
  run('corepack', ['enable'], workspace)
  run('pnpm', ['install', '--ignore-scripts', '--registry', registry], workspace)
  return workspace
}
