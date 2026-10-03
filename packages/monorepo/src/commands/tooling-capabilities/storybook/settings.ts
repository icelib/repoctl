import type { PackageJson } from '../../../types'
import type { StorybookArgs, StorybookCapabilityOptions } from '../types'
import path from 'pathe'
import semver from 'semver'
import { canonicalDirectory, hash, readOptional, relativeFile } from '../../../core/file-transaction/paths'
import { clearWorkspaceCache, getWorkspaceData } from '../../../core/workspace'

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
    throw new Error(`Invalid Storybook ${label}`)
  }
  return value
}

function identifier(value: unknown, label: string) {
  const result = text(value, label)
  if (!/^[a-z_$][\w$]*$/i.test(result) || ['__proto__', 'constructor', 'prototype', 'default'].includes(result)) {
    throw new Error(`Invalid Storybook ${label}: expected a named JavaScript identifier`)
  }
  return result
}

function args(value: unknown): StorybookArgs {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Storybook args must be a JSON object of primitive prop values')
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    identifier(key, 'prop')
    if (item !== null && !['string', 'number', 'boolean'].includes(typeof item)) {
      throw new Error(`Storybook prop ${key} must be a JSON primitive`)
    }
    if (typeof item === 'number' && !Number.isFinite(item)) {
      throw new TypeError(`Storybook prop ${key} must be finite`)
    }
    return [key, item]
  }))
}

function normalizeExample(example: StorybookCapabilityOptions['example']): StorybookCapabilityOptions['example'] {
  if (example?.kind === 'prop-update') {
    const initial = text(example.initial, 'initial prop value')
    const updated = text(example.updated, 'updated prop value')
    if (initial === updated) {
      throw new Error('Storybook prop states must differ')
    }
    return { kind: 'prop-update', prop: identifier(example.prop, 'prop'), initial, updated }
  }
  if (example?.kind !== 'click') {
    throw new Error('Storybook requires an explicit prop-update or click example')
  }
  const click = example.click
  if (!click || typeof click !== 'object') {
    throw new Error('Storybook click example requires a locator')
  }
  const locator = 'testId' in click ? { testId: text(click.testId, 'test ID') } : { role: click.role, name: text(click.name, 'click name') }
  if ('role' in locator && !['button', 'link'].includes(locator.role)) {
    throw new Error('Storybook click role must be button or link')
  }
  const initial = args(example.args)
  const alternate = args(example.alternateArgs)
  if (JSON.stringify(initial) === JSON.stringify(alternate)) {
    throw new Error('Storybook click example requires distinct initial and alternate states')
  }
  return { kind: 'click', args: initial, alternateArgs: alternate, click: locator, expectText: text(example.expectText, 'expected text') }
}

export async function resolveStorybookSettings(cwd: string, input: StorybookCapabilityOptions) {
  const selector = text(input.target, 'target')
  if (!['vue', 'react'].includes(input.framework)) {
    throw new Error('Storybook framework must be vue or react')
  }
  clearWorkspaceCache()
  const data = await getWorkspaceData(cwd, { ignorePrivatePackage: false })
  const root = await canonicalDirectory(data.workspaceDir)
  const matches = data.packages.filter(pkg => pkg.manifest.name === selector || path.relative(root, pkg.rootDir) === selector)
  if (matches.length !== 1) {
    throw new Error(`Expected one exact Storybook target for ${selector}; found ${matches.length}`)
  }
  const targetDirectory = relativeFile(path.relative(root, matches[0]!.rootDir))
  const raw = (await readOptional(root, `${targetDirectory}/package.json`))!
  const manifest = JSON.parse(raw.toString()) as PackageJson
  const name = text(manifest.name, 'package name')
  const runtime = input.framework
  const range = manifest.devDependencies?.[runtime] ?? manifest.dependencies?.[runtime] ?? manifest.peerDependencies?.[runtime]
  if (!range || !semver.validRange(range) || !semver.subset(range, runtime === 'vue' ? '>=3 <4' : '>=18 <20') || !manifest.scripts?.['build'] || (!manifest.exports && !manifest['main'] && !manifest['module'])) {
    throw new Error(`Unsupported Storybook target ${name}: require a Vue 3 or React 18/19 library export, concrete runtime range and build script`)
  }
  const slug = name.replace(/^@/, '').replace(/[^a-z0-9-]+/gi, '-').toLowerCase()
  const directory = relativeFile(input.directory ?? `stories/${slug}`)
  if (directory.startsWith('.') || directory === targetDirectory || directory.startsWith(`${targetDirectory}/`) || targetDirectory.startsWith(`${directory}/`)) {
    throw new Error('Storybook workspace must be separate from the component library and hidden configuration')
  }
  const workspaceName = `@repoctl-stories/${slug}`
  if (data.packages.some(pkg => pkg.manifest.name === workspaceName && path.relative(root, pkg.rootDir) !== directory)) {
    throw new Error(`Workspace name already exists: ${workspaceName}`)
  }
  const options: StorybookCapabilityOptions = { capability: 'storybook', target: name, directory, framework: input.framework, component: identifier(input.component, 'component export'), example: normalizeExample(input.example) }
  return { root, options, runtimeRange: range, target: { name, directory: targetDirectory, manifestHash: hash(raw) }, workspace: { name: workspaceName, directory } }
}
