import type { BootstrapOptions } from '@icebreakers/monorepo'
import { existsSync } from 'node:fs'
import { readFile, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createBootstrapPlan, prepareBootstrap, releaseBootstrap } from '@icebreakers/monorepo'
import crossSpawn from 'cross-spawn'
import { expect, it, vi } from 'vitest'
import { prepareFixture } from './prepareFixture'

it('freezes exactly one explicit prerelease with its build closure without installing, building or changing source', async () => {
  const h = await prepareFixture()
  const original = await readFile(path.join(h.cwd, 'packages/a/package.json'), 'utf8')
  const plan = await createBootstrapPlan(h.options)
  expect(plan).toMatchObject({ schemaVersion: 1, package: { name: 'bootstrap-a', directory: 'packages/a', currentVersion: '0.0.0', version: '0.1.0-alpha.0' }, tag: 'alpha', registry: 'https://registry.npmjs.org/', protectedTags: ['latest'], buildDirectories: ['packages/a', 'packages/build'] })
  const report = await prepareBootstrap({ ...h.options, plan, dryRun: true })
  expect(report.status).toBe('planned')
  expect(existsSync(h.options.outputDirectory!)).toBe(false)
  expect(existsSync(path.join(h.cwd, 'packages/a/dist'))).toBe(false)
  expect(await readFile(path.join(h.cwd, 'packages/a/package.json'), 'utf8')).toBe(original)
  expect(h.run('git', ['status', '--porcelain'])).toBe('')
}, 30_000)

it('rejects credentialed and recursive planning before evaluating candidate configuration', async () => {
  const h = await prepareFixture()
  const sentinel = path.join(h.root, 'config-evaluated')
  await h.write('repoctl.config.cjs', 'require("node:fs").writeFileSync(require("node:path").join(__dirname,"..","config-evaluated"),"evaluated");module.exports={}')
  h.commit()
  const options = { ...h.options, source: h.source() }
  for (const key of ['ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'NODE_AUTH_TOKEN', 'NPM_TOKEN', 'REPOCTL_BOOTSTRAP_RUNNING']) {
    const guarded = { ...options, env: { ...h.env, [key]: 'unexpected' } }
    const message = key === 'REPOCTL_BOOTSTRAP_RUNNING' ? 'cannot run recursively' : 'without OIDC or npm publishing credentials'
    await expect(createBootstrapPlan(guarded)).rejects.toThrow(message)
    await expect(releaseBootstrap({ ...guarded, stage: 'prepare', dryRun: true })).rejects.toThrow(message)
    expect(existsSync(sentinel)).toBe(false)
    expect(existsSync(options.outputDirectory!)).toBe(false)
  }
  await createBootstrapPlan(options)
  expect(await readFile(sentinel, 'utf8')).toBe('evaluated')
}, 30_000)

it('does not let an explicit child environment hide process credentials or recursive preparation', async () => {
  const h = await prepareFixture()
  const sentinel = path.join(h.root, 'config-evaluated')
  await h.write('repoctl.config.cjs', 'require("node:fs").writeFileSync(require("node:path").join(__dirname,"..","config-evaluated"),"evaluated");module.exports={}')
  h.commit()
  const options = { ...h.options, source: h.source(), env: {} }
  for (const key of ['ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'NODE_AUTH_TOKEN', 'NPM_TOKEN', 'REPOCTL_BOOTSTRAP_RUNNING']) {
    try {
      vi.stubEnv(key, 'unexpected')
      const message = key === 'REPOCTL_BOOTSTRAP_RUNNING' ? 'cannot run recursively' : 'without OIDC or npm publishing credentials'
      await expect(createBootstrapPlan(options)).rejects.toThrow(message)
      await expect(releaseBootstrap({ ...options, stage: 'prepare', dryRun: true })).rejects.toThrow(message)
      expect(existsSync(sentinel)).toBe(false)
      expect(existsSync(options.outputDirectory!)).toBe(false)
    }
    finally {
      vi.unstubAllEnvs()
    }
  }
}, 30_000)

it('rejects wildcard names, private and root packages, stable versions, and nonpublic registries', async () => {
  const h = await prepareFixture()
  for (const packageName of ['bootstrap-*', 'bootstrap-build', 'bootstrap-root', 'missing']) {
    await expect(createBootstrapPlan({ ...h.options, packageName })).rejects.toThrow()
  }
  for (const version of ['1.0.0', '^1.0.0-alpha.0', 'v1.0.0-alpha.0']) {
    await expect(createBootstrapPlan({ ...h.options, version })).rejects.toThrow('explicit canonical semver prerelease')
  }
  await expect(createBootstrapPlan({ ...h.options, registry: 'https://example.invalid/' })).rejects.toThrow('official public npm registry')
  await expect(createBootstrapPlan({ ...h.options, tag: 'latest' })).rejects.toThrow('stable or maintenance')
}, 30_000)

it.each([
  { config: { access: 'restricted' }, message: 'cannot override explicit nonpublic publishConfig.access' },
  { config: { registry: 'https://registry.example.invalid/' }, message: 'cannot move a workspace target from its explicit registry' },
])('preserves an explicitly nonpublic publication target: $config', async ({ config, message }) => {
  const h = await prepareFixture()
  const original = JSON.parse(await readFile(path.join(h.cwd, 'packages/a/package.json'), 'utf8')) as Record<string, unknown>
  await h.write('packages/a/package.json', JSON.stringify({ ...original, publishConfig: config }))
  h.commit()
  await expect(createBootstrapPlan({ ...h.options, source: h.source() })).rejects.toThrow(message)
  expect(existsSync(h.options.outputDirectory!)).toBe(false)
}, 30_000)

it('freezes configured stable and maintenance tags and rejects their use', async () => {
  const h = await prepareFixture()
  await h.write('repoctl.config.cjs', 'module.exports={commands:{release:{branches:{maintenance:[{branch:"1.x",range:">=1 <2",tag:"legacy"}]}}}}')
  h.commit()
  const options = { ...h.options, source: h.source() }
  expect((await createBootstrapPlan(options)).protectedTags).toEqual(['latest', 'legacy'])
  await expect(createBootstrapPlan({ ...options, tag: 'legacy' })).rejects.toThrow('stable or maintenance')
}, 30_000)

it('rejects pack-directory indirection and local dependencies escaping the frozen repository', async () => {
  const h = await prepareFixture()
  const file = path.join(h.cwd, 'packages/a/package.json')
  const original = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>
  await h.write('packages/a/package.json', JSON.stringify({ ...original, publishConfig: { directory: 'publish' } }))
  h.commit()
  await expect(createBootstrapPlan({ ...h.options, source: h.source() })).rejects.toThrow('publishConfig.directory')
  await h.write('packages/a/package.json', JSON.stringify({ ...original, dependencies: { outside: 'file:../../../outside' } }))
  h.commit()
  await expect(createBootstrapPlan({ ...h.options, source: h.source() })).rejects.toThrow('stay inside')
}, 30_000)

it('rejects mismatched pnpm versions, source identities, dirty source and committed links', async () => {
  const h = await prepareFixture()
  const spawn: NonNullable<BootstrapOptions['spawn']> = ((command, args, settings) => {
    if (command === 'pnpm' && args?.includes('--version')) {
      return { status: 0, signal: null, stdout: '1.0.0\n', stderr: '', pid: 1, output: [null, '1.0.0\n', ''] }
    }
    return crossSpawn.sync(command, args ?? [], settings as Parameters<typeof crossSpawn.sync>[2])
  }) as NonNullable<BootstrapOptions['spawn']>
  await expect(createBootstrapPlan({ ...h.options, spawn })).rejects.toThrow('trusted pnpm version')
  await expect(createBootstrapPlan({ ...h.options, source: { ...h.source(), commit: 'a'.repeat(40) } })).rejects.toThrow('checked-out HEAD')
  await writeFile(path.join(h.cwd, 'untracked'), 'dirty')
  await expect(createBootstrapPlan(h.options)).rejects.toThrow('clean committed source tree')
  h.commit()
  if (process.platform !== 'win32') {
    await symlink('../outside', path.join(h.cwd, 'escape'))
    h.commit()
    await expect(createBootstrapPlan({ ...h.options, source: h.source() })).rejects.toThrow('symbolic links')
  }
}, 30_000)
