import fs from 'node:fs'
import path from 'node:path'
import { initTooling, runDoctor } from 'repoctl'
import { afterEach, describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { defaultConfig, temporaryDirectory, write } from './helpers'

const directories: string[] = []
function workspace() {
  const cwd = temporaryDirectory()
  directories.push(cwd)
  write(cwd, 'package.json', JSON.stringify({ name: 'hook-init', private: true }))
  return cwd
}

afterEach(() => {
  for (const cwd of directories.splice(0)) {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
})

describe('built Lefthook tooling initialization', () => {
  it('adds postinstall permission using an existing older pnpm allowlist', async () => {
    const cwd = workspace()
    write(cwd, 'pnpm-workspace.yaml', 'onlyBuiltDependencies:\n  - esbuild\nignoredBuiltDependencies:\n  - sharp\n')
    await initTooling(cwd, { targets: ['lefthook'] })
    const manifest = YAML.parse(fs.readFileSync(path.join(cwd, 'pnpm-workspace.yaml'), 'utf8'))
    expect(manifest.onlyBuiltDependencies).toEqual(['esbuild', 'lefthook'])
    expect(manifest.ignoredBuiltDependencies).toEqual(['sharp'])
    expect(manifest.allowBuilds).toBeUndefined()
  })

  it('creates native configuration and build approval without Git', async () => {
    const cwd = workspace()
    const result = await initTooling(cwd, { targets: ['lefthook'] })
    expect(result.writtenFiles).toEqual(['lefthook.yml'])
    expect(fs.readFileSync(path.join(cwd, 'lefthook.yml'), 'utf8')).toBe(defaultConfig)
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'))
    expect(pkg.devDependencies.lefthook).toBe('2.2.2')
    expect(pkg.devDependencies.husky).toBeUndefined()
    expect(pkg.devDependencies['lint-staged']).toBeUndefined()
    expect(pkg.scripts?.prepare).toBeUndefined()
    const manifest = YAML.parse(fs.readFileSync(path.join(cwd, 'pnpm-workspace.yaml'), 'utf8'))
    expect(manifest.allowBuilds.lefthook).toBe(true)
    const doctor = await runDoctor(cwd)
    expect(doctor.checks.find(check => check.id === 'commit-hooks')?.status).toBe('pass')
  })

  it('preserves a customized native configuration and an explicit postinstall denial', async () => {
    const cwd = workspace()
    const config = 'pre-commit:\n  jobs:\n    - run: company-check\n'
    write(cwd, 'lefthook.yml', config)
    write(cwd, 'pnpm-workspace.yaml', 'allowBuilds:\n  lefthook: false\n')
    const result = await initTooling(cwd, { targets: ['lefthook'] })
    expect(result.skippedFiles).toEqual(['lefthook.yml'])
    expect(fs.readFileSync(path.join(cwd, 'lefthook.yml'), 'utf8')).toBe(config)
    expect(YAML.parse(fs.readFileSync(path.join(cwd, 'pnpm-workspace.yaml'), 'utf8')).allowBuilds.lefthook).toBe(false)
    const doctor = await runDoctor(cwd)
    expect(doctor.checks.find(check => check.id === 'commit-hooks')?.status).toBe('warn')
  })

  it('reports malformed native configuration', async () => {
    const cwd = workspace()
    await initTooling(cwd, { targets: ['lefthook'] })
    write(cwd, 'lefthook.yml', 'pre-commit: [\n')
    const doctor = await runDoctor(cwd)
    expect(doctor.checks.find(check => check.id === 'commit-hooks')).toMatchObject({ status: 'warn', detail: 'Could not parse lefthook.yml.' })
  })
})
