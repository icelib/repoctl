import type { NightlyOptions } from '@icebreakers/monorepo'
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { releaseNightly } from '@icebreakers/monorepo'
import { expect, it, vi } from 'vitest'
import { exchangeToken, idToken, env as oidcEnv } from '../oidc/fixtures'
import { completed } from './consumer/fixture'
import { fixture, json } from './fixture'

interface PublishedManifest {
  name: string
  version: string
  dist: { tarball: string }
}

it.each([false, true])('uses the isolated workspace compiler for published nightly declarations (invalid: %s)', async (invalid) => {
  const h = await fixture()
  const require = createRequire(import.meta.url)
  const compilerDirectory = path.dirname(require.resolve('typescript/package.json'))
  const nodeTypesDirectory = path.dirname(require.resolve('@types/node/package.json'))
  const compiler = JSON.parse(await readFile(path.join(compilerDirectory, 'package.json'), 'utf8'))
  const nodeTypes = JSON.parse(await readFile(path.join(nodeTypesDirectory, 'package.json'), 'utf8'))
  expect(compiler.version).toMatch(/^6\./)
  const rootManifest = JSON.parse(await readFile(path.join(h.cwd, 'package.json'), 'utf8'))
  await h.write('package.json', JSON.stringify({ ...rootManifest, devDependencies: { typescript: compiler.version } }))
  h.env['npm_config_registry'] = 'https://registry.npmjs.org/'
  h.run('pnpm', ['install', '--ignore-scripts', '--no-frozen-lockfile', '--registry=https://registry.npmjs.org/'])
  for (const name of ['a', 'b']) {
    const file = `packages/${name}/package.json`
    const manifest = JSON.parse(await readFile(path.join(h.cwd, file), 'utf8'))
    await h.write(file, JSON.stringify({
      ...manifest,
      exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' }, ...(name === 'a' ? { './worker.js': './dist/worker.js' } : {}) },
      ...(name === 'a' ? { repoctl: { packageCheck: { runtimeAssets: ['./worker.js'] } } } : {}),
    }))
    await h.write(`packages/${name}/index.d.ts`, name === 'a' ? 'export declare const value: Uint8Array<ArrayBuffer>' : 'export { value } from "snapshot-a"')
  }
  await h.write('packages/a/index.js', 'export const value = new Uint8Array()')
  await h.write('packages/a/worker.js', 'self.addEventListener("fetch", () => {});')
  await h.write('build.cjs', 'const fs=require("fs"); for(const name of ["a","b"]) {fs.mkdirSync("packages/"+name+"/dist",{recursive:true}); for(const file of ["index.js","index.d.ts", ...(name === "a" ? ["worker.js"] : [])]) fs.copyFileSync("packages/"+name+"/"+file,"packages/"+name+"/dist/"+file)}')
  h.run('git', ['add', '.'])
  h.run('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'typed fixture'])
  const commit = h.run('git', ['rev-parse', 'HEAD'])
  const manifests = (name: string): Record<string, PublishedManifest> => {
    const file = path.join(h.store, `${name}.json`)
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  }
  const registryFetch = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input))
    if (url.hostname === 'oidc.actions.githubusercontent.com') {
      return json({ value: idToken })
    }
    if (url.pathname.includes('/oidc/token/exchange/package/')) {
      return json({ token: exchangeToken })
    }
    if (url.pathname.startsWith('/-/package/')) {
      const published = Object.values(manifests(decodeURIComponent(url.pathname.split('/')[3]!)))[0]
      return json({ latest: '1.0.0', ...(published ? { 'snapshot-nightly': published.version } : {}) })
    }
    const [, name, version] = url.pathname.split('/')
    const published = manifests(decodeURIComponent(name!))[decodeURIComponent(version!)]
    return published ? json(published) : json({}, 404)
  })
  const original = h.options.spawn!
  let consumerDirectory = ''
  const spawn: NonNullable<NightlyOptions['spawn']> = ((command, args, settings) => {
    if (command === 'npm' && args?.[0] === 'view') {
      const reference = args[1]!
      const separator = reference.lastIndexOf('@')
      const manifest = manifests(reference.slice(0, separator))[reference.slice(separator + 1)]
      return manifest
        ? { ...completed('', 0), stdout: args.includes('version') ? manifest.version : JSON.stringify(manifest) }
        : completed('E404 Not Found')
    }
    if (command === 'pnpm' && args?.includes('install') && String(settings?.cwd).includes(`${path.sep}consumer-`)) {
      consumerDirectory = realpathSync(String(settings?.cwd))
      const manifest = JSON.parse(readFileSync(path.join(consumerDirectory, 'package.json'), 'utf8'))
      expect(manifest.devDependencies['repoctl-consumer-typescript']).toBe(`npm:typescript@${compiler.version}`)
      expect(manifest.devDependencies['repoctl-consumer-node-types']).toBe(`npm:@types/node@${nodeTypes.version}`)
      for (const name of ['snapshot-a', 'snapshot-b']) {
        const published = Object.values(manifests(name))[0]!
        const installed = path.join(consumerDirectory, 'node_modules', name)
        mkdirSync(installed, { recursive: true })
        h.run('tar', ['-xzf', path.join(h.store, path.basename(published.dist.tarball)), '-C', installed, '--strip-components=1'])
      }
      cpSync(compilerDirectory, path.join(consumerDirectory, 'node_modules/repoctl-consumer-typescript'), { recursive: true, dereference: true })
      cpSync(nodeTypesDirectory, path.join(consumerDirectory, 'node_modules/repoctl-consumer-node-types'), { recursive: true, dereference: true })
      const nodeRequire = createRequire(path.join(nodeTypesDirectory, 'package.json'))
      cpSync(path.dirname(nodeRequire.resolve('undici-types/package.json')), path.join(consumerDirectory, 'node_modules/undici-types'), { recursive: true, dereference: true })
      if (invalid) {
        writeFileSync(path.join(consumerDirectory, 'node_modules/snapshot-a/dist/index.d.ts'), 'export interface Invalid { [key: string]: string; enabled: boolean } export declare const value: number')
      }
      return completed('', 0)
    }
    return original(command, args, settings)
  }) as NonNullable<NightlyOptions['spawn']>
  const report = await releaseNightly({ ...h.options, publish: true, registryFetch, spawn, env: { ...h.env, ...oidcEnv, GITHUB_SHA: commit } })
  expect(report.consumer, report.error).toBeDefined()
  expect(report.consumer?.status, report.error).toBe(invalid ? 'failed' : 'verified')
  expect(report.status, report.error).toBe(invalid ? 'failed' : 'published')
  const checks = report.consumer!.commands.filter(command => command.args.includes('--noEmit'))
  expect(checks).toHaveLength(invalid ? 1 : 2)
  for (const check of checks) {
    expect(check.args[0]).toBe(path.join(consumerDirectory, 'node_modules/repoctl-consumer-typescript/bin/tsc'))
    expect(path.dirname(check.args[check.args.indexOf('--typeRoots') + 1]!)).toBe(consumerDirectory)
    expect(check.args.slice(check.args.indexOf('--types'), check.args.indexOf('--types') + 2)).toEqual(['--types', 'node'])
    expect(check.args.slice(check.args.indexOf('--skipLibCheck'), check.args.indexOf('--skipLibCheck') + 2)).toEqual(['--skipLibCheck', 'false'])
  }
  if (invalid) {
    expect(checks[0]?.output).toContain('TS2411')
  }
  else {
    expect(report.consumer!.commands.some(command => command.args[0] === '--check' && command.args[1]?.endsWith('worker.js'))).toBe(true)
  }
  expect(existsSync(consumerDirectory)).toBe(false)
}, 120_000)
