import type { NightlyOptions } from '@icebreakers/monorepo'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
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

it('retries a transitive consumer miss after confirmed publication without uploading the batch again', async () => {
  const h = await fixture()
  const original = h.options.spawn!
  const manifests = (name: string): Record<string, PublishedManifest> => {
    const filename = path.join(h.store, `${name}.json`)
    return existsSync(filename) ? JSON.parse(readFileSync(filename, 'utf8')) : {}
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
      const name = decodeURIComponent(url.pathname.split('/')[3]!)
      const published = Object.values(manifests(name))[0]
      return json({ latest: '1.0.0', ...(published ? { 'snapshot-nightly': published.version } : {}) })
    }
    const [, encodedName, encodedVersion] = url.pathname.split('/')
    const manifest = manifests(decodeURIComponent(encodedName!))[decodeURIComponent(encodedVersion!)]
    return manifest ? json(manifest) : json({}, 404)
  })
  const sleep = vi.fn(async () => {})
  let consumerAttempts = 0
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
      consumerAttempts++
      expect(h.uploads).toHaveLength(2)
      const consumerManifest = JSON.parse(readFileSync(path.join(String(settings?.cwd), 'package.json'), 'utf8'))
      expect(consumerManifest.devDependencies).toBeUndefined()
      const target = Object.values(manifests('snapshot-a'))[0]!
      const parent = Object.values(manifests('snapshot-b'))[0]!
      if (consumerAttempts === 1) {
        const reference = `${target.name}@${target.version}`
        const parentReference = `${parent.name}@${parent.version}`
        return completed(JSON.stringify({
          name: 'pnpm',
          level: 'error',
          code: 'ERR_PNPM_NO_MATCHING_VERSION',
          message: `No matching version found for ${reference} while fetching it from https://registry.npmjs.org/\n\nFailed to resolve ${reference}\nThis error happened while installing the dependencies of ${parentReference}`,
          pkgsStack: [{ id: parentReference, name: parent.name, version: parent.version }],
        }))
      }
      for (const manifest of [target, parent]) {
        const directory = path.join(String(settings?.cwd), 'node_modules', manifest.name)
        mkdirSync(directory, { recursive: true })
        h.run('tar', ['-xzf', path.join(h.store, path.basename(manifest.dist.tarball)), '-C', directory, '--strip-components=1'])
      }
      const installedParent = JSON.parse(readFileSync(path.join(String(settings?.cwd), 'node_modules', parent.name, 'package.json'), 'utf8'))
      expect(installedParent.dependencies[target.name]).toBe(target.version)
      return completed('', 0)
    }
    return original(command, args, settings)
  }) as NonNullable<NightlyOptions['spawn']>

  const report = await releaseNightly({ ...h.options, publish: true, registryFetch, spawn, sleep, env: { ...h.env, ...oidcEnv }, config: { ...h.options.config, registry: { visibilityTimeoutMs: 10_000 } } })

  expect(report.status, report.error).toBe('published')
  expect(report.confirmed).toBe(true)
  expect(report.consumer?.status).toBe('verified')
  expect(report.consumer?.packages.map(pkg => pkg.name)).toEqual(['snapshot-a', 'snapshot-b'])
  expect(report.consumer?.commands.filter(command => command.args.includes('install')).map(command => command.exitCode)).toEqual([1, 0])
  expect(report.consumer?.commands.filter(command => command.args.includes('--eval'))).toHaveLength(2)
  expect(report.consumer?.commands.some(command => command.args.includes('--noEmit'))).toBe(false)
  expect(consumerAttempts).toBe(2)
  expect(sleep.mock.calls).toEqual([[2_000]])
  expect(h.uploads).toHaveLength(2)
  expect(new Set(h.uploads.map(args => args[1])).size).toBe(2)
  expect(h.uploads.every(args => args[args.indexOf('--tag') + 1] === 'snapshot-nightly')).toBe(true)
  expect(report.packages.every(pkg => pkg.published)).toBe(true)
  expect(report.latest).toEqual({ 'snapshot-a': '1.0.0', 'snapshot-b': '1.0.0' })
  expect(JSON.parse(await readFile(path.join(report.outputDirectory!, 'consumer-report.json'), 'utf8'))).toEqual(report.consumer)
  expect(h.run('git', ['status', '--porcelain'])).toBe('')
}, 120_000)
