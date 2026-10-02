import type { DoctorReport } from '@/commands/doctor'
import { spawnSync } from 'node:child_process'
import { realpath, symlink } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import fs from '@/utils/fs'
// eslint-disable-next-line antfu/no-import-dist
import { runDoctor } from '../../../dist/index.mjs'
import { createTempWorkspace } from './helpers'

const cli = fileURLToPath(new URL('../../../bin/repoctl.js', import.meta.url))

async function fixture() {
  const root = await realpath(await createTempWorkspace('repoctl manifest health '))
  await fs.outputJson(path.join(root, 'package.json'), { name: 'root', private: true })
  await fs.outputFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: ["domains/**", "!domains/excluded/**"]\n')
  const write = (directory: string, data: unknown) => fs.outputJson(path.join(root, directory, 'package.json'), data)
  const findings = async () => (await runDoctor(root)).checks.filter(check => check.id.startsWith('manifest-'))
  return { root, write, findings }
}

describe('built per-package manifest health', () => {
  it('isolates unreadable manifests while checking duplicate identities, structures and versions in custom layouts', async () => {
    const f = await fixture()
    await f.write('domains/team/a', { name: 'duplicate', private: true, dependencies: ['bad'], version: 'latest' })
    await f.write('domains/team/b', { name: 'duplicate', private: true, devDependencies: { dep: 42 } })
    await f.write('domains/unnamed', { private: true })
    await f.write('domains/invalid-name', { name: '../invalid', private: true })
    await fs.outputFile(path.join(f.root, 'domains/broken/package.json'), '{ "token": "secret-value",')
    await fs.outputFile(path.join(f.root, 'domains/excluded/package.json'), '{broken')
    await fs.outputFile(path.join(f.root, 'domains/team/a/node_modules/hidden/package.json'), '{broken')
    const report = await runDoctor(f.root)
    expect(report.packageCount).toBe(5)
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'manifest-parse', path: 'domains/broken/package.json', status: 'fail' }),
      expect.objectContaining({ id: 'manifest-dependency-section', path: 'domains/team/a/package.json', field: 'dependencies' }),
      expect.objectContaining({ id: 'manifest-dependency-specifier', path: 'domains/team/b/package.json', field: 'devDependencies.dep' }),
      expect.objectContaining({ id: 'manifest-version-invalid', path: 'domains/team/a/package.json', field: 'version' }),
      expect.objectContaining({ id: 'manifest-name-missing', path: 'domains/unnamed/package.json', field: 'name' }),
      expect.objectContaining({ id: 'manifest-name-invalid', path: 'domains/invalid-name/package.json', field: 'name' }),
    ]))
    expect(report.checks.filter(check => check.id === 'manifest-name-duplicate')).toHaveLength(2)
    expect(JSON.stringify(report)).not.toContain('secret-value')
    expect(await f.findings()).toEqual(report.checks.filter(check => check.id.startsWith('manifest-')))
  })

  it('resolves workspace aliases and paths, distinguishes missing targets, and permits peer/dev pairs', async () => {
    const f = await fixture()
    await f.write('domains/lib', { name: '@scope/lib', private: true, version: '1.0.0' })
    await f.write('domains/app', {
      name: 'app',
      private: true,
      dependencies: { relative: 'workspace:../lib', alias: 'workspace:@scope/lib@*', wrong: 'workspace:@scope/lib@^2', missing: 'workspace:*', self: 'workspace:app@*', same: '^1', conflict: '^1' },
      devDependencies: { same: '>=1 <2', conflict: '^2', react: '^19' },
      peerDependencies: { react: '^18 || ^19' },
    })
    const checks = await f.findings()
    expect(checks.filter(check => check.id === 'manifest-workspace-target').map(check => check.field)).toEqual(['dependencies.missing'])
    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'manifest-self-dependency', field: 'dependencies.self' }),
      expect.objectContaining({ id: 'manifest-dependency-duplicate', status: 'warn' }),
      expect.objectContaining({ id: 'manifest-dependency-conflict', status: 'fail' }),
      expect.objectContaining({ id: 'manifest-workspace-version-mismatch', field: 'dependencies.wrong', status: 'fail' }),
    ]))
    expect(checks.some(check => check.field?.includes('react'))).toBe(false)
  })

  it('canonicalizes a symlink workspace directory before locating root manifest evidence', async () => {
    const f = await fixture()
    const parent = await createTempWorkspace('repoctl manifest alias ')
    const alias = path.join(parent, 'workspace')
    await symlink(f.root, alias, process.platform === 'win32' ? 'junction' : 'dir')
    const report = await runDoctor(alias)
    expect(path.normalize(report.workspaceDir)).toBe(path.normalize(f.root))
    expect(report.packageCount).toBe(0)
    expect(report.checks.filter(check => check.id.startsWith('manifest-'))).toMatchObject([{ id: 'manifest-health', status: 'pass' }])
  })

  it('uses warnings for optional overrides and publishing recommendations, and exempts private applications', async () => {
    const f = await fixture()
    await f.write('domains/private', { name: 'private', private: true, publishConfig: 'not-used' })
    await f.write('domains/public', {
      name: 'published',
      version: '1.0.0',
      repository: { url: 'https://example.com/team/repo', directory: 'wrong' },
      publishConfig: { access: 'open', registry: 'https://user:secret@registry.invalid' },
      dependencies: { portable: '^1' },
      optionalDependencies: { portable: '^2' },
    })
    const checks = await f.findings()
    expect(checks.every(check => check.path === 'domains/public/package.json' && check.status === 'warn')).toBe(true)
    expect(checks.map(check => check.id)).toEqual(expect.arrayContaining(['manifest-license', 'manifest-repository-directory', 'manifest-publish-access', 'manifest-publish-registry', 'manifest-dependency-duplicate']))
    expect(JSON.stringify(checks)).not.toContain('secret')
  })

  it('reads pnpm yaml and JSON5 manifests and refreshes them on every API call', async () => {
    const f = await fixture()
    await fs.outputFile(path.join(f.root, 'domains/yaml/package.yaml'), 'name: yaml\nprivate: true\n')
    await fs.outputFile(path.join(f.root, 'domains/json5/package.json5'), '{name:"json-five",private:true,}')
    expect(await f.findings()).toMatchObject([{ id: 'manifest-health', status: 'pass' }])
    await fs.outputFile(path.join(f.root, 'domains/yaml/package.yaml'), 'name: yaml\nprivate: true\nversion: nope\n')
    expect(await f.findings()).toEqual([expect.objectContaining({ id: 'manifest-version-invalid', path: 'domains/yaml/package.yaml' })])
    await f.write('domains/json5', { name: 'json-first', private: true })
    expect(await f.findings()).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'manifest-multiple' })]))
  })

  it('accepts alternative pnpm root manifest formats without a missing package.json failure', async () => {
    const f = await fixture()
    await fs.remove(path.join(f.root, 'package.json'))
    for (const [filename, text] of [['package.yaml', 'name: root\nprivate: true\n'], ['package.json5', '{name:"root",private:true,}']]) {
      await fs.outputFile(path.join(f.root, filename!), text!)
      const report = await runDoctor(f.root)
      expect(report.checks.find(check => check.id === 'package-json')).toMatchObject({ status: 'pass', title: filename })
      expect(report.checks.filter(check => check.id.startsWith('manifest-'))).toMatchObject([{ id: 'manifest-health', status: 'pass' }])
      await fs.remove(path.join(f.root, filename!))
    }
  })

  it('continues after invalid root data and explains incomplete discovery for invalid workspace patterns', async () => {
    const f = await fixture()
    await f.write('.', { name: 'root', private: true, dependencies: ['broken'], engines: { node: 22 } })
    await f.write('domains/app', { name: 'app', private: true, version: 'nope' })
    expect(await f.findings()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'manifest-dependency-section', path: 'package.json' }),
      expect.objectContaining({ id: 'manifest-version-invalid', path: 'domains/app/package.json' }),
    ]))
    await fs.writeFile(path.join(f.root, 'package.json'), 'null')
    expect(await f.findings()).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'manifest-parse', path: 'package.json' })]))
    await fs.writeFile(path.join(f.root, 'pnpm-workspace.yaml'), 'packages: [42]\n')
    expect(await f.findings()).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'manifest-workspace-parse', status: 'fail' })]))
  })

  it('keeps CLI JSON fields stable between languages and includes locations/details in Markdown without writes', async () => {
    const f = await fixture()
    await f.write('domains/app', { private: true })
    const before = await fs.readFile(path.join(f.root, 'domains/app/package.json'), 'utf8')
    const invoke = (args: string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: f.root, encoding: 'utf8', env: { ...process.env, CI: 'true', NODE_ENV: 'production' }, timeout: 30000 })
    const en = invoke(['--lang', 'en', 'doctor', '--json'])
    const zh = invoke(['--lang', 'zh-CN', 'doctor', '--json'])
    expect(en.status).toBe(1)
    const fields = (text: string) => (JSON.parse(text) as DoctorReport).checks.map(({ id, path, field, status }) => ({ id, path, field, status }))
    expect(fields(en.stdout)).toEqual(fields(zh.stdout))
    const markdown = invoke(['--lang', 'en', 'doctor', '--markdown', '--redact'])
    expect(markdown.stdout).toContain('domains/app/package.json')
    expect(markdown.stdout).toContain('Declare a nonempty package name.')
    expect(markdown.stdout).not.toContain(f.root)
    expect(await fs.readFile(path.join(f.root, 'domains/app/package.json'), 'utf8')).toBe(before)
  })
})
