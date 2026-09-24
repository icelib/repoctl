import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import semver from 'semver'

const require = createRequire(import.meta.url)
const PACKAGE_DIR = path.resolve(__dirname, '..')
const packageJson = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8'),
) as {
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

const antfuPackageJson = require('@antfu/eslint-config/package.json') as {
  peerDependencies?: Record<string, string>
}

const BUNDLED_REACT_PACKAGES = [
  '@eslint-react/eslint-plugin',
  'eslint-plugin-react-hooks',
  'eslint-plugin-react-refresh',
] as const

const BUNDLED_RUNTIME_PACKAGES = [
  '@typescript-eslint/utils',
  '@weapp-vite/eslint',
] as const

const ANTFU_PEER_CHECK_PACKAGES = [
  '@eslint-react/eslint-plugin',
  'eslint-plugin-react-refresh',
] as const

const OPTIONAL_A11Y_PACKAGES = [
  'eslint-plugin-jsx-a11y',
  'eslint-plugin-vuejs-accessibility',
] as const

const CONSUMER_PROVIDED_FEATURE_PACKAGES = [
  '@next/eslint-plugin-next',
  '@prettier/plugin-xml',
  '@tanstack/eslint-plugin-query',
  '@unocss/eslint-plugin',
  'astro-eslint-parser',
  'eslint-plugin-astro',
  'eslint-plugin-better-stylelint',
  'eslint-plugin-mdx',
  'eslint-plugin-svelte',
  'prettier',
  'prettier-plugin-astro',
  'svelte',
  'svelte-eslint-parser',
] as const

const ANTFU_OPTIONAL_PEER_PACKAGES = [
  '@next/eslint-plugin-next',
  '@unocss/eslint-plugin',
] as const

function readInstalledPackageJson(name: string): { version: string } {
  const packageJsonPath = path.join(
    PACKAGE_DIR,
    'node_modules',
    ...name.split('/'),
    'package.json',
  )

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`Unable to locate package.json for ${name}`)
  }

  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    version: string
  }
}

describe('peer compatibility', () => {
  it.each(BUNDLED_REACT_PACKAGES)('bundles %s as a runtime dependency', (name) => {
    expect(packageJson.dependencies?.[name]).toBeTruthy()
    expect(packageJson.optionalDependencies?.[name]).toBeUndefined()
  })

  it.each(BUNDLED_RUNTIME_PACKAGES)('bundles %s as a runtime dependency', (name) => {
    expect(packageJson.dependencies?.[name]).toBeTruthy()
    expect(packageJson.optionalDependencies?.[name]).toBeUndefined()
    expect(packageJson.peerDependencies?.[name]).toBeUndefined()
  })

  it.each([...OPTIONAL_A11Y_PACKAGES, ...CONSUMER_PROVIDED_FEATURE_PACKAGES])('keeps %s consumer provided', (name) => {
    expect(packageJson.dependencies?.[name]).toBeUndefined()
    expect(packageJson.optionalDependencies?.[name]).toBeUndefined()
  })

  it.each(ANTFU_PEER_CHECK_PACKAGES)(
    'keeps the installed %s version within the @antfu/eslint-config peer range',
    (name) => {
      const installedPackageJson = readInstalledPackageJson(name)
      const peerRange = antfuPackageJson.peerDependencies?.[name]

      expect(peerRange).toBeTruthy()
      expect(
        semver.satisfies(installedPackageJson.version, peerRange!, {
          includePrerelease: true,
        }),
      ).toBe(true)
    },
  )

  it.each(ANTFU_OPTIONAL_PEER_PACKAGES)('documents %s as an @antfu optional peer', (name) => {
    expect(antfuPackageJson.peerDependencies?.[name]).toBeTruthy()
  })

  it('installs @weapp-vite/eslint with the config package', () => {
    // Do not pin the exact caret range; patch bumps must not fail this test.
    const range = packageJson.dependencies?.['@weapp-vite/eslint']
    expect(range).toEqual(expect.stringMatching(/^\^\d+\.\d+\.\d+$/))
    expect(packageJson.peerDependencies?.['@weapp-vite/eslint']).toBeUndefined()
    expect(
      semver.satisfies(
        readInstalledPackageJson('@weapp-vite/eslint').version,
        range!,
        { includePrerelease: true },
      ),
    ).toBe(true)
  })
})
