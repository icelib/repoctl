import type { PackedPackage } from '../../../src/commands/package-check/types'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { consumeTarball } from '../../../src/commands/package-check/consumer'
import { execute } from '../../../src/commands/package-check/process'

vi.mock('../../../src/commands/package-check/process', async importOriginal => ({
  ...await importOriginal<typeof import('../../../src/commands/package-check/process')>(),
  execute: vi.fn(),
}))

const directories: string[] = []
const version = '12.14.0'
const packageManager = `pnpm@${version}`
const executeMock = vi.mocked(execute)

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
  vi.resetAllMocks()
})

async function fixture(installedVersion = version, versionExitCode = 0) {
  const root = await mkdtemp(path.join(tmpdir(), 'consumer-launcher-'))
  directories.push(root)
  const directory = path.join(root, 'consumer')
  const env = { PATH: path.join(root, 'bin'), COREPACK_HOME: path.join(root, 'empty-corepack'), COREPACK_ENABLE_NETWORK: '0' }
  const pkg: PackedPackage = {
    bytes: new Uint8Array(),
    manifest: {
      name: 'fixture-launcher',
      version: '1.0.0',
      peerDependencies: { provider: 'npm:semver@>=7.8.5 <8' },
      peerDependenciesMeta: { provider: { optional: true } },
    },
    result: {
      name: 'fixture-launcher',
      directory: path.join(root, 'source'),
      role: 'selected',
      status: 'passed',
      tarball: path.join(root, 'package.tgz'),
      files: ['package.json'],
      diagnostics: [],
      commands: [],
    },
  }
  executeMock.mockImplementation(async (executable, args, cwd) => {
    const checkingVersion = args[0] === '--version'
    const stdout = checkingVersion ? `${installedVersion}\n` : args.includes('view') ? '"7.8.5"' : ''
    if (args.includes('install')) {
      await mkdir(path.join(cwd, 'node_modules', pkg.manifest.name!), { recursive: true })
    }
    return { cwd, executable, args, exitCode: checkingVersion ? versionExitCode : 0, stdout, stderr: '', output: stdout }
  })
  async function consume(options: NonNullable<Parameters<typeof consumeTarball>[6]> = {}) {
    await consumeTarball(pkg, [pkg], [pkg.result], [], directory, 5000, { env, ...options })
  }
  async function manifest() {
    return JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')) as {
      packageManager?: string
      dependencies: Record<string, string>
    }
  }
  return { env, pkg, directory, consume, manifest }
}

it('keeps the default pinned consumer on Corepack for both registry lookup and installation', async () => {
  const h = await fixture()
  await h.consume({ packageManager })
  expect(executeMock.mock.calls.map(([command, args]) => [command, args.slice(0, 2)])).toEqual([
    ['corepack', ['pnpm', 'view']],
    ['corepack', ['pnpm', 'install']],
  ])
  expect((await h.manifest()).packageManager).toBe(packageManager)
  expect(h.pkg.result.diagnostics).toEqual([])
})

it('checks the installed pnpm before lookup and installation using the same environment and keeps the declared pin', async () => {
  const h = await fixture()
  await h.consume({ packageManager, packageManagerLauncher: 'installed' })
  expect(executeMock.mock.calls.map(([command, args]) => [command, args[0]])).toEqual([
    ['pnpm', '--version'],
    ['pnpm', 'view'],
    ['pnpm', 'install'],
  ])
  expect(executeMock.mock.calls[0]?.[1]).toEqual(['--version'])
  for (const [, , cwd, timeout, options] of executeMock.mock.calls) {
    expect(cwd).toBe(h.directory)
    expect(timeout).toBe(5000)
    expect(options?.env).toBe(h.env)
  }
  expect(await h.manifest()).toMatchObject({ packageManager, dependencies: { provider: 'npm:semver@7.8.5' } })
  expect(h.pkg.result.commands.map(command => command.executable)).toEqual(['pnpm', 'pnpm', 'pnpm'])
  expect(h.pkg.result.diagnostics).toEqual([])
})

it.each([
  { installed: '12.15.0', exitCode: 0 },
  { installed: version, exitCode: 1 },
])('blocks an installed launcher mismatch or failed version check before any registry or install command: $installed/$exitCode', async ({ installed, exitCode }) => {
  const h = await fixture(installed, exitCode)
  await h.consume({ packageManager, packageManagerLauncher: 'installed' })
  expect(executeMock.mock.calls.map(([command, args]) => [command, args])).toEqual([['pnpm', ['--version']]])
  expect(h.pkg.result.diagnostics).toContainEqual(expect.objectContaining({ code: 'CONSUMER_PACKAGE_MANAGER', severity: 'error' }))
})

it('does not use an installed launcher for a noncanonical package manager pin', async () => {
  const h = await fixture()
  await h.consume({ packageManager: 'pnpm@^12.14.0', packageManagerLauncher: 'installed' })
  expect(executeMock).not.toHaveBeenCalled()
  expect(h.pkg.result.diagnostics).toContainEqual(expect.objectContaining({ code: 'CONSUMER_PACKAGE_MANAGER', severity: 'error' }))
})

it('keeps unpinned consumers on the existing pnpm path without adding a version check', async () => {
  const h = await fixture()
  await h.consume()
  expect(executeMock.mock.calls.map(([command, args]) => [command, args[0]])).toEqual([
    ['pnpm', 'view'],
    ['pnpm', 'install'],
  ])
  expect((await h.manifest()).packageManager).toBeUndefined()
  expect(h.pkg.result.diagnostics).toEqual([])
})
