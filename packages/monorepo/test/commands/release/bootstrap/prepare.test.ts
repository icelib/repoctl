import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createBootstrapPlan, prepareBootstrap } from '@icebreakers/monorepo'
import crossSpawn from 'cross-spawn'
import { expect, it } from 'vitest'
import { readSnapshotArchive } from '../../../../src/commands/release/snapshot/archive'
import { prepareFixture } from './prepareFixture'

it('refuses to overwrite previous preparation evidence before installing or packing', async () => {
  const h = await prepareFixture()
  const plan = await createBootstrapPlan(h.options)
  await mkdir(h.options.outputDirectory!, { recursive: true })
  const previous = path.join(h.options.outputDirectory!, 'bootstrap-manifest.json')
  await writeFile(previous, 'retained original evidence')
  await expect(prepareBootstrap({ ...h.options, plan })).rejects.toThrow('must be empty')
  expect(await readFile(previous, 'utf8')).toBe('retained original evidence')
  expect(await readdir(h.options.outputDirectory!)).toEqual(['bootstrap-manifest.json'])
}, 30_000)

it('builds only the dependency closure, runs package checks and emits one portable native tarball', async () => {
  const h = await prepareFixture()
  const original = await readFile(path.join(h.cwd, 'packages/a/package.json'), 'utf8')
  const plan = await createBootstrapPlan(h.options)
  const report = await prepareBootstrap({ ...h.options, plan })
  expect(report.status).toBe('prepared')
  const directory = report.outputDirectory!
  expect(directory).toBe(h.options.outputDirectory)
  expect((await readdir(directory)).sort()).toEqual(['bootstrap-manifest.json', 'tarballs'])
  expect(await readdir(path.join(directory, 'tarballs'))).toEqual(['package.tgz'])
  expect(report.manifest?.package).toMatchObject({ name: 'bootstrap-a', version: '0.1.0-alpha.0', tarball: 'tarballs/package.tgz', integrity: expect.stringMatching(/^sha512-/u) })
  expect(report.manifest?.checks.package.commands).toEqual([])
  expect(report.manifest?.checks.package.directory).toBe('packages/a')
  expect(report.manifest?.entries).toEqual([expect.objectContaining({ subpath: '.', target: './dist/index.js', format: 'esm', runtime: true })])
  const isolated = report.checks![0]!.directory
  expect(await readFile(path.join(isolated, 'checks.log'), 'utf8')).toBe('lint\ntypecheck\ntest\ntest:types\n')
  expect(existsSync(path.join(isolated, '../build/dist'))).toBe(true)
  expect(existsSync(path.join(isolated, '../unrelated/dist'))).toBe(false)
  const files = await readSnapshotArchive(await readFile(path.join(directory, 'tarballs/package.tgz')))
  const packed = JSON.parse(files.find(file => file.path === 'package/package.json')!.data.toString()) as Record<string, unknown>
  expect(packed['version']).toBe('0.1.0-alpha.0')
  expect(packed['publishConfig']).toEqual({ access: 'public', registry: plan.registry, tag: 'alpha' })
  expect(await readFile(path.join(h.cwd, 'packages/a/package.json'), 'utf8')).toBe(original)
  expect(h.run('git', ['status', '--porcelain'])).toBe('')
  const moved = path.join(h.root, 'portable')
  await rename(directory, moved)
  expect(JSON.parse(await readFile(path.join(moved, 'bootstrap-manifest.json'), 'utf8'))).toEqual(report.manifest)
}, 120_000)

it('prepares and consumes public declarations for a scoped package in a nested non-packages layout', async () => {
  const h = await prepareFixture()
  const target = 'modules/nested/markup'
  const packageName = '@fixture/template-engine'
  await mkdir(path.join(h.cwd, 'modules/nested'), { recursive: true })
  await rename(path.join(h.cwd, 'packages/a'), path.join(h.cwd, target))
  const original = JSON.parse(await readFile(path.join(h.cwd, target, 'package.json'), 'utf8')) as Record<string, unknown>
  await h.write(`${target}/package.json`, JSON.stringify({ ...original, name: packageName, exports: { types: './dist/index.d.ts', import: './dist/index.js' } }))
  await h.write(`${target}/build.cjs`, 'const fs=require("fs");fs.mkdirSync("dist",{recursive:true});fs.writeFileSync("dist/index.js","export const value = 42\\n");fs.writeFileSync("dist/index.d.ts","export declare const value: 42\\n");')
  await h.write('pnpm-workspace.yaml', 'packages:\n  - packages/*\n  - modules/nested/*\n')
  await h.write('.gitignore', 'node_modules/\n**/dist/\n**/checks.log\n')
  h.run('pnpm', ['install', '--lockfile-only', '--ignore-scripts'])
  h.commit()
  const options = { ...h.options, packageName, version: '2.3.0-preview.7', tag: 'preview', source: h.source() }
  const plan = await createBootstrapPlan(options)
  expect(plan.package).toMatchObject({ name: packageName, directory: target, version: options.version })
  expect(plan.buildDirectories).toEqual([target, 'packages/build'])
  const report = await prepareBootstrap({ ...options, plan })
  expect(report.status).toBe('prepared')
  expect(report.manifest?.package).toMatchObject({ name: packageName, directory: target, version: options.version, files: expect.arrayContaining(['dist/index.js', 'dist/index.d.ts', 'package.json']) })
  expect(report.manifest?.entries).toContainEqual(expect.objectContaining({ subpath: '.', format: 'esm', target: './dist/index.js', runtime: true }))
  expect(report.checks![0]!.commands.some(command => command.args.includes('--noEmit') && command.args.includes('--strict') && command.exitCode === 0)).toBe(true)
  expect(h.run('git', ['status', '--porcelain'])).toBe('')
}, 120_000)

it('rejects credentials and frozen-plan drift before creating the preparation directory', async () => {
  const h = await prepareFixture()
  const plan = await createBootstrapPlan(h.options)
  for (const key of ['ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'NODE_AUTH_TOKEN', 'NPM_TOKEN']) {
    await expect(prepareBootstrap({ ...h.options, plan, env: { ...h.env, [key]: 'unexpected' } })).rejects.toThrow('without OIDC')
  }
  await expect(prepareBootstrap({ ...h.options, plan: { ...plan, buildDirectories: ['packages/unrelated'] } })).rejects.toThrow('trusted frozen plan')
  expect(existsSync(h.options.outputDirectory!)).toBe(false)
}, 30_000)

it('rejects lifecycle changes to the packed identity', async () => {
  const h = await prepareFixture()
  const file = path.join(h.cwd, 'packages/a/package.json')
  const original = JSON.parse(await readFile(file, 'utf8')) as { scripts: Record<string, string> }
  await h.write('packages/a/package.json', JSON.stringify({ ...original, scripts: { ...original.scripts, prepack: 'node tamper.cjs' } }))
  await h.write('packages/a/tamper.cjs', 'const fs=require("fs");const file="package.json";const pkg=JSON.parse(fs.readFileSync(file,"utf8"));pkg.version="9.9.9-alpha.0";fs.writeFileSync(file,JSON.stringify(pkg));')
  h.commit()
  const options = { ...h.options, source: h.source() }
  const plan = await createBootstrapPlan(options)
  await expect(prepareBootstrap({ ...options, plan })).rejects.toThrow('pack lifecycle changed')
}, 120_000)

it('fails an unavailable internal runtime dependency without packing additional workspace packages', async () => {
  const h = await prepareFixture()
  const file = path.join(h.cwd, 'packages/a/package.json')
  const original = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>
  await h.write('packages/a/package.json', JSON.stringify({ ...original, dependencies: { 'bootstrap-build': 'workspace:*' } }))
  h.run('pnpm', ['install', '--lockfile-only', '--ignore-scripts'])
  h.commit()
  let registryQuery = false
  const spawn: NonNullable<typeof h.options.spawn> = ((command, args, settings) => {
    if (command === 'pnpm' && args?.includes('view')) {
      registryQuery = true
      return { status: 0, signal: null, stdout: '[]', stderr: '', pid: 1, output: [null, '[]', ''] }
    }
    return crossSpawn.sync(command, args ?? [], settings as Parameters<typeof crossSpawn.sync>[2])
  }) as NonNullable<typeof h.options.spawn>
  const options = { ...h.options, source: h.source(), spawn }
  const plan = await createBootstrapPlan(options)
  await expect(prepareBootstrap({ ...options, plan })).rejects.toThrow('automatic publication expansion is not allowed')
  expect(registryQuery).toBe(true)
  expect(h.run('git', ['status', '--porcelain'])).toBe('')
}, 120_000)

it('enforces the workflow event default branch before running any candidate build', async () => {
  const h = await prepareFixture()
  const source = h.source()
  const event = path.join(h.root, 'event.json')
  await writeFile(event, JSON.stringify({ repository: { full_name: source.repository, id: source.repositoryId, default_branch: 'different' } }))
  const env = { ...h.env, GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_EVENT_PATH: event, GITHUB_REPOSITORY: source.repository, GITHUB_REPOSITORY_ID: String(source.repositoryId), GITHUB_SHA: source.commit, GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ID: String(source.runId), GITHUB_RUN_ATTEMPT: String(source.runAttempt), GITHUB_WORKFLOW_REF: source.workflowRef }
  await expect(createBootstrapPlan({ ...h.options, env })).rejects.toThrow('event repository default branch')
  expect(existsSync(h.options.outputDirectory!)).toBe(false)
}, 30_000)
