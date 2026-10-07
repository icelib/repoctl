import { access, cp, mkdir, readdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { applyWorkspaceArtifactPlan, planWorkspaceArtifact } from '@icebreakers/monorepo'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { fixture, json, manager, node, runCli, snapshot } from './fixture'

describe('workspace artifacts through native tools and built public APIs', () => {
  it.each([false, true])('prunes a build dependency closure using native Turbo (docker=%s)', async (docker) => {
    const h = await fixture()
    const before = await snapshot(h.root)
    const plan = await planWorkspaceArtifact(h.root, { target: 'service', mode: 'prune', output: h.output, docker })
    expect(plan.manifestCandidates).toEqual(['packages/build-only', 'packages/core', 'packages/service'])
    expect(JSON.stringify(plan)).not.toContain('SECRET-SENTINEL')
    await expect(access(h.output)).rejects.toThrow()
    expect(await applyWorkspaceArtifactPlan(h.root, plan)).toMatchObject({ status: 'applied', mode: 'prune' })
    const prefix = docker ? 'full/' : ''
    await access(path.join(h.output, `${prefix}packages/build-only/package.json`))
    await access(path.join(h.output, `${prefix}packages/core/package.json`))
    await expect(access(path.join(h.output, `${prefix}packages/unrelated`))).rejects.toThrow()
    await expect(access(path.join(h.output, `${prefix}packages/service/.env`))).rejects.toThrow()
    await access(path.join(h.output, `${prefix}packages/service/.env.example`))
    const lockfile = await readFile(path.join(h.output, 'pnpm-lock.yaml'), 'utf8')
    expect(lockfile).toContain('packages/build-only:')
    expect(lockfile).not.toContain('packages/unrelated:')
    expect(await snapshot(h.root)).toEqual(before)
    expect(await applyWorkspaceArtifactPlan(h.root, plan)).toMatchObject({ status: 'unchanged' })
  })

  it.each([false, true])('deploys production workspace dependencies and runs without the source repository (legacy=%s)', async (legacy) => {
    const h = await fixture()
    const before = await snapshot(h.root)
    const plan = await planWorkspaceArtifact(h.root, { target: './packages/service', mode: 'deploy', output: h.output, offline: true, legacy })
    expect(plan.command.args).toContain('--prod')
    expect(plan.command.args).toContain('--ignore-scripts')
    expect(plan.manifestCandidates).not.toContain('packages/build-only')
    const result = await applyWorkspaceArtifactPlan(h.root, plan)
    expect(result.status).toBe('applied')
    await expect(access(path.join(h.output, '.env'))).rejects.toThrow()
    await expect(access(path.join(h.output, 'node_modules/build-only'))).rejects.toThrow()
    expect(await readFile(path.join(h.output, '.env.example'), 'utf8')).toBe('TOKEN=replace-me\n')
    expect(await snapshot(h.root)).toEqual(before)
    expect(await applyWorkspaceArtifactPlan(h.root, plan)).toMatchObject({ status: 'unchanged' })
    const portable = path.join(h.parent, 'portable')
    await cp(h.output, portable, { recursive: true, dereference: true })
    await rm(h.root, { recursive: true })
    await rm(h.output, { recursive: true })
    expect((await node(process.execPath, [path.join(portable, 'dist/index.js')], { cwd: portable })).stdout.trim()).toBe('portable artifact')
  })

  it.each([false, true])('deploys packages without production dependencies (legacy=%s)', async (legacy) => {
    const h = await fixture()
    const plan = await planWorkspaceArtifact(h.root, { target: 'core', mode: 'deploy', output: h.output, offline: true, legacy })
    expect(await applyWorkspaceArtifactPlan(h.root, plan)).toMatchObject({ status: 'applied' })
    expect((await node(process.execPath, ['-e', 'console.log(require("./dist/index.js"))'], { cwd: h.output })).stdout.trim()).toBe('portable artifact')
    expect(await applyWorkspaceArtifactPlan(h.root, plan)).toMatchObject({ status: 'unchanged' })
  })

  it('allows an explicitly empty destination and rejects unrelated or edited nonempty output', async () => {
    const h = await fixture()
    await mkdir(h.output)
    const plan = await planWorkspaceArtifact(h.root, { target: 'service', mode: 'deploy', output: h.output, offline: true })
    await writeFile(path.join(h.output, 'notes.txt'), 'preserve me')
    await expect(applyWorkspaceArtifactPlan(h.root, plan)).rejects.toThrow('not empty')
    expect(await readFile(path.join(h.output, 'notes.txt'), 'utf8')).toBe('preserve me')
    await rm(path.join(h.output, 'notes.txt'))
    await applyWorkspaceArtifactPlan(h.root, plan)
    await writeFile(path.join(h.output, 'dist/index.js'), 'concurrent artifact edit')
    await expect(applyWorkspaceArtifactPlan(h.root, plan)).rejects.toThrow('changed')
    expect(await readFile(path.join(h.output, 'dist/index.js'), 'utf8')).toBe('concurrent artifact edit')
  })

  it('rejects stale and tampered plans without creating output', async () => {
    const h = await fixture()
    const plan = await planWorkspaceArtifact(h.root, { target: 'service', mode: 'deploy', output: h.output, offline: true })
    await expect(applyWorkspaceArtifactPlan(h.root, { ...plan, command: { executable: 'other', args: [] } })).rejects.toThrow('changed')
    await writeFile(path.join(h.root, 'packages/core/dist/index.js'), 'module.exports = 2\n')
    await expect(applyWorkspaceArtifactPlan(h.root, plan)).rejects.toThrow('changed')
    await expect(access(h.output)).rejects.toThrow()
  })

  it('rejects wildcard selectors, unsupported modes, unsafe output and linked source inputs', async () => {
    const h = await fixture()
    const options = { target: 'service', mode: 'deploy' as const, output: h.output, offline: true }
    await expect(planWorkspaceArtifact(h.root, { ...options, target: 'service...' })).rejects.toThrow()
    await expect(planWorkspaceArtifact(h.root, { ...options, target: 'missing' })).rejects.toThrow()
    await expect(planWorkspaceArtifact(h.root, { ...options, output: path.join(h.root, 'out') })).rejects.toThrow('outside')
    await expect(planWorkspaceArtifact(h.root, { ...options, output: h.parent })).rejects.toThrow('outside')
    await symlink(h.root, h.output, process.platform === 'win32' ? 'junction' : 'dir')
    await expect(planWorkspaceArtifact(h.root, options)).rejects.toThrow('linked')
    await rm(h.output)
    await symlink(h.root, path.join(h.root, 'source-link'), process.platform === 'win32' ? 'junction' : 'dir')
    await expect(planWorkspaceArtifact(h.root, options)).rejects.toThrow('Linked source')
  })

  it('diagnoses missing tools, unsupported pinned versions, missing build entries and native files exclusions', async () => {
    const h = await fixture()
    await rm(path.join(h.root, 'node_modules/turbo'))
    await expect(planWorkspaceArtifact(h.root, { target: 'service', mode: 'prune', output: h.output })).rejects.toThrow('Install Turbo')
    await json(h.root, 'package.json', { name: 'fixture', private: true, packageManager: 'pnpm@9.0.0' })
    const options = { target: 'service', mode: 'deploy' as const, output: h.output, offline: true }
    await expect(planWorkspaceArtifact(h.root, options)).rejects.toThrow('stable pinned pnpm majors')
    await json(h.root, 'package.json', { name: 'fixture', private: true, packageManager: `pnpm@${manager}` })
    await rename(path.join(h.root, 'packages/service/dist/index.js'), path.join(h.root, 'packages/service/dist/other.js'))
    await expect(planWorkspaceArtifact(h.root, options)).rejects.toThrow('Built deploy entry is missing')
    await rename(path.join(h.root, 'packages/service/dist/other.js'), path.join(h.root, 'packages/service/dist/index.js'))
    const manifest = JSON.parse(await readFile(path.join(h.root, 'packages/service/package.json'), 'utf8'))
    delete manifest.main
    manifest.files = ['source.js']
    await json(h.root, 'packages/service/package.json', manifest)
    await expect(planWorkspaceArtifact(h.root, options)).rejects.toThrow('requires --entry')
    const plan = await planWorkspaceArtifact(h.root, { ...options, entry: 'dist/index.js' })
    await expect(applyWorkspaceArtifactPlan(h.root, plan)).rejects.toThrow('excluded by native')
    await expect(access(h.output)).rejects.toThrow()
  })

  it('rejects configured native write paths into the source workspace before executing deploy', async () => {
    const h = await fixture()
    await writeFile(path.join(h.root, 'pnpm-workspace.yaml'), `packages:\n  - packages/*\nstoreDir: ${JSON.stringify(path.join(h.root, 'custom-store'))}\n`)
    const before = await snapshot(h.root)
    await expect(planWorkspaceArtifact(h.root, { target: 'service', mode: 'deploy', output: h.output })).rejects.toThrow('would write inside the source')
    expect(await snapshot(h.root)).toEqual(before)
    await expect(access(path.join(h.root, 'custom-store'))).rejects.toThrow()
  })

  it('exposes read-only CLI preview, portable JSON apply and mode conflict diagnostics', async () => {
    const h = await fixture()
    const before = await snapshot(h.root)
    const preview = runCli(h.root, ['service', '--mode', 'deploy', '--out', h.output, '--offline', '--dry-run', '--json'])
    expect(preview.status, preview.stderr).toBe(0)
    expect(JSON.parse(preview.stdout).kind).toBe('workspace-artifact')
    expect(await snapshot(h.root)).toEqual(before)
    expect(await readdir(h.parent)).toEqual(['source'])
    const filename = path.join(h.parent, 'plan.json')
    await writeFile(filename, preview.stdout)
    const applied = runCli(h.root, ['--apply', filename, '--json'])
    expect(applied.status, applied.stderr).toBe(0)
    expect(JSON.parse(applied.stdout).status).toBe('applied')
    expect(runCli(h.root, ['--apply', filename, '--dry-run']).status).not.toBe(0)
    expect(runCli(h.root, ['service', '--mode', 'prune', '--out', h.output, '--offline']).status).not.toBe(0)
  })
})
