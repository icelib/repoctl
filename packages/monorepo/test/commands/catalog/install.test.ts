import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import process from 'node:process'
import { applyCatalogMigrationPlan, planCatalogMigration } from '@icebreakers/monorepo'
import spawn from 'cross-spawn'
import path from 'pathe'
import { expect, it } from 'vitest'
import YAML from 'yaml'
import { fixture } from '../deps/fixture'
import { packageArchive } from './archive'

it('lets pnpm resolve migrated default/named catalogs and aliases, update the lockfile and consume built packages', async () => {
  const dependency = 'repoctl-catalog-fixture'
  const alias = `npm:${dependency}@^1.1.0`
  const { packageManager } = JSON.parse(await readFile(new URL('../../../../../package.json', import.meta.url), 'utf8'))
  const h = await fixture({
    '.': { packageManager },
    'packages/a': { dependencies: { [dependency]: '^1.1.0' }, devDependencies: { alias }, peerDependencies: { [dependency]: '^1 || ^2' } },
    'packages/b': { dependencies: { [dependency]: '^1.1.0' }, devDependencies: { alias } },
  })
  const env = { ...process.env, HOME: h.home, USERPROFILE: h.home, COREPACK_ENABLE_NETWORK: '0', HUSKY: '0' }
  const run = (executable: string, args: string[], cwd = h.workspace) => new Promise<string>((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env })
    let output = ''
    child.stdout?.on('data', data => output += data.toString())
    child.stderr?.on('data', data => output += data.toString())
    const timeout = setTimeout(() => child.kill(), 30_000)
    child.on('error', reject)
    child.on('close', (code) => {
      clearTimeout(timeout)
      if (code === 0) {
        resolve(output)
      }
      else {
        reject(new Error(`Command failed (${code}): ${executable} ${args.join(' ')}\n${output}`))
      }
    })
  })
  const pnpm = process.env['npm_execpath'] ?? 'pnpm'
  const archive = packageArchive(dependency)
  let registry = ''
  let requests = 0
  const server = createServer((request, response) => {
    requests++
    if (request.url === '/package.tgz') {
      response.end(archive)
      return
    }
    if (request.url !== `/${dependency}`) {
      response.statusCode = 404
      response.end('{}')
      return
    }
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ 'name': dependency, 'dist-tags': { latest: '1.1.0' }, 'versions': { '1.1.0': { name: dependency, version: '1.1.0', dist: { tarball: `${registry}/package.tgz`, integrity: `sha512-${createHash('sha512').update(archive).digest('base64')}` } } } }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Missing fixture registry port')
  }
  registry = `http://127.0.0.1:${address.port}`
  try {
    await applyCatalogMigrationPlan(h.workspace, await planCatalogMigration(h.workspace, { dependency, section: 'dependencies' }))
    await applyCatalogMigrationPlan(h.workspace, await planCatalogMigration(h.workspace, { dependency: 'alias', section: 'devDependencies', catalog: 'aliases' }))
    expect(requests).toBe(0)
    await expect(readFile(path.join(h.workspace, 'pnpm-lock.yaml'))).rejects.toThrow()
    const install = ['--ignore-scripts', '--registry', registry, '--store-dir', path.join(h.root, 'store'), '--config.minimumReleaseAge=0']
    await run(pnpm, ['install', '--lockfile-only', ...install])
    await run(pnpm, ['install', '--frozen-lockfile', ...install])
    const lock = Object.assign({}, ...YAML.parseAllDocuments(await readFile(path.join(h.workspace, 'pnpm-lock.yaml'), 'utf8')).map(document => document.toJSON()))
    expect(lock.catalogs).toMatchObject({ default: { [dependency]: { specifier: '^1.1.0', version: '1.1.0' } }, aliases: { alias: { specifier: alias, version: '1.1.0' } } })
    for (const name of ['a', 'b']) {
      const output = await run(process.execPath, ['-e', `if(require('${dependency}') !== 42 || require('alias') !== 42)process.exit(1)`], path.join(h.workspace, 'packages', name))
      expect(output).toBe('')
    }
    expect(JSON.parse(await readFile(path.join(h.workspace, 'packages/a/package.json'), 'utf8')).peerDependencies[dependency]).toBe('^1 || ^2')
  }
  finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}, 90_000)
