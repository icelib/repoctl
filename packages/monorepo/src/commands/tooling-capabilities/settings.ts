import type { PackageJson } from '../../types'
import type { ToolingCapabilityOptions } from './types'
import { createHash } from 'node:crypto'
import path from 'pathe'
import { canonicalDirectory, checkedFile, hash, readOptional, relativeFile } from '../../core/file-transaction/paths'
import { clearWorkspaceCache, getWorkspaceData } from '../../core/workspace'

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
    throw new Error(`Invalid tooling capability ${label}`)
  }
  return value
}

function port(value: unknown, fallback: number) {
  if (value === undefined) {
    return fallback
  }
  if (!Number.isInteger(value) || Number(value) < 1024 || Number(value) > 65535) {
    throw new Error('Tooling capability ports must be integers between 1024 and 65535')
  }
  return Number(value)
}

export async function resolveCapabilitySettings(cwd: string, input: ToolingCapabilityOptions) {
  if (!input || input.capability !== 'playwright') {
    throw new Error('Unknown tooling capability; run repo tooling list')
  }
  const target = text(input.target, 'target')
  clearWorkspaceCache()
  const workspace = await getWorkspaceData(cwd, { ignorePrivatePackage: false })
  const root = await canonicalDirectory(workspace.workspaceDir)
  const matches = workspace.packages.filter(pkg => pkg.manifest.name === target || path.relative(root, pkg.rootDir) === target)
  if (matches.length !== 1) {
    throw new Error(`Expected one exact target workspace for ${target}; found ${matches.length}`)
  }
  const pkg = matches[0]!
  const name = text(pkg.manifest.name, 'target package name')
  const targetDirectory = relativeFile(path.relative(root, pkg.rootDir))
  await checkedFile(root, `${targetDirectory}/package.json`)
  const manifest = JSON.parse((await readOptional(root, `${targetDirectory}/package.json`))!.toString()) as PackageJson
  const deps = { ...manifest.dependencies, ...manifest.devDependencies }
  if (!deps['vite'] || (!deps['vue'] && !deps['react']) || !manifest.scripts?.['build'] || !manifest.scripts['preview'] || !/\bvite\s+preview\b/.test(manifest.scripts['preview'])) {
    throw new Error(`Unsupported E2E target ${name}: require Vue/React, Vite, build and a vite preview script`)
  }
  const slug = name.replace(/^@/, '').replace(/[^a-z0-9-]+/gi, '-').toLowerCase()
  const directory = relativeFile(input.directory ?? `e2e/${slug}`)
  if (directory === targetDirectory || directory.startsWith(`${targetDirectory}/`) || targetDirectory.startsWith(`${directory}/`) || directory.startsWith('.')) {
    throw new Error('E2E workspace must be outside the target application and hidden configuration directories')
  }
  const e2eName = `@repoctl-e2e/${slug}`
  if (workspace.packages.some(pkg => pkg.manifest.name === e2eName && path.relative(root, pkg.rootDir) !== directory)) {
    throw new Error(`Workspace name already exists: ${e2eName}`)
  }
  const interaction = input.interaction
  const route = text(interaction?.route, 'route')
  if (!route.startsWith('/') || route.startsWith('//') || route.includes('\\')) {
    throw new Error('E2E route must be a local absolute URL path')
  }
  const click = interaction?.click
  if (!click || typeof click !== 'object') {
    throw new Error('E2E interaction requires a click locator')
  }
  const locator = 'testId' in click
    ? { testId: text(click.testId, 'click.testId') }
    : { role: click.role, name: text(click.name, 'click.name') }
  if ('role' in locator && !['button', 'link'].includes(locator.role)) {
    throw new Error('E2E click role must be button or link')
  }
  if (input.reuseExistingServer !== undefined && typeof input.reuseExistingServer !== 'boolean') {
    throw new Error('reuseExistingServer must be a boolean')
  }
  const localPort = port(input.port, 4173)
  const ciPort = port(input.ciPort, 40000 + createHash('sha256').update(e2eName).digest().readUInt16BE(0) % 10000)
  if (localPort === ciPort) {
    throw new Error('CI must have a dedicated port different from the local port')
  }
  const options: ToolingCapabilityOptions = {
    capability: 'playwright',
    target: name,
    directory,
    interaction: { route, click: locator, expectText: text(interaction.expectText, 'expectText') },
    port: localPort,
    ciPort,
    reuseExistingServer: input.reuseExistingServer ?? false,
  }
  return { root, options, target: { name, directory: targetDirectory, manifestHash: hash((await readOptional(root, `${targetDirectory}/package.json`))!) }, workspace: { name: e2eName, directory } }
}
