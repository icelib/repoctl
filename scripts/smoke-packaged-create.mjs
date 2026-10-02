import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { assertConsumerContract, installConsumer } from './packaged/consumer.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..')
const tempRoot = mkdtempSync(path.join(tmpdir(), 'repoctl-packaged-create-'))
const packDir = path.join(tempRoot, 'packs')
const bootstrapDir = path.join(tempRoot, 'bootstrap')
const sourceManifest = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
const sourceNpmrc = readFileSync(path.join(repoRoot, '.npmrc'), 'utf8')
const tarballs = new Map()

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, HUSKY: '0', CI: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 180_000,
    maxBuffer: 10 * 1024 * 1024,
  })
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function pack(packageName) {
  if (tarballs.has(packageName)) {
    return tarballs.get(packageName)
  }
  const existing = new Set(readdirSync(packDir))
  run('pnpm', ['--filter', packageName, 'pack', '--pack-destination', packDir], repoRoot)
  const created = readdirSync(packDir).filter(file => file.endsWith('.tgz') && !existing.has(file))
  assert.equal(created.length, 1, `one tarball must be created for ${packageName}`)
  const tarball = path.join(packDir, created[0])
  tarballs.set(packageName, tarball)
  return tarball
}

function extractPackage(tarball, packageName) {
  const extractionDir = path.join(tempRoot, `extract-${packageName.replaceAll('/', '-')}`)
  mkdirSync(extractionDir, { recursive: true })
  run('tar', ['-xf', tarball, '-C', extractionDir], repoRoot)
  const destination = path.join(bootstrapDir, 'node_modules', packageName)
  mkdirSync(path.dirname(destination), { recursive: true })
  renameSync(path.join(extractionDir, 'package'), destination)
}

function linkPackageDependencies(packageName, sourcePackageName) {
  const destination = path.join(bootstrapDir, 'node_modules', packageName, 'node_modules')
  const source = path.join(repoRoot, 'packages', sourcePackageName, 'node_modules')
  symlinkSync(source, destination, 'junction')
}

function checkWorkspace(workspaceDir) {
  const manifest = readJson(path.join(workspaceDir, 'package.json'))
  assert.equal(manifest.packageManager, sourceManifest.packageManager)
  assert.equal(manifest.devDependencies?.repoctl, 'latest')
  assert.equal(manifest.scripts?.['test:packaged-create'], undefined)
  assertConsumerContract(workspaceDir)
  const npmrc = readFileSync(path.join(workspaceDir, '.npmrc'), 'utf8')
  assert.equal(npmrc, sourceNpmrc)
  assert.match(npmrc, /^package-manager-strict=true$/mu)
  assert.match(npmrc, /^package-manager-strict-version=true$/mu)
  assert.match(readFileSync(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'utf8'), /^pmOnFail: error$/mu)

  for (const name of ['AGENTS.md', 'CLAUDE.md', '.agents/skills/repoctl/SKILL.md']) {
    const instructions = readFileSync(path.join(workspaceDir, name), 'utf8')
    assert.ok(instructions.includes('pnpm create repoctl@latest'), `${name} must select the latest create package`)
    assert.ok(instructions.includes('corepack enable'), `${name} must enable the workspace package manager`)
  }

  assert.equal(readJson(path.join(workspaceDir, 'packages/tsdown/package.json')).name, '@icebreakers/tsdown-template')
  assert.deepEqual(readJson(path.join(workspaceDir, 'tsconfig.json')).references, [{ path: './packages/tsdown' }])
  if (existsSync(path.join(workspaceDir, '.changeset'))) {
    const sourceIntents = readdirSync(path.join(workspaceDir, '.changeset')).filter(file => file.endsWith('.md'))
    assert.deepEqual(sourceIntents, [], 'generated workspaces must not include source changeset intents')
  }
}

try {
  mkdirSync(packDir, { recursive: true })
  mkdirSync(bootstrapDir, { recursive: true })

  console.log('Packing the workspace creator and templates...')
  const templatesTarball = pack('@icebreakers/monorepo-templates')
  const createTarball = pack('create-repoctl')
  extractPackage(templatesTarball, '@icebreakers/monorepo-templates')
  extractPackage(createTarball, 'create-repoctl')
  linkPackageDependencies('@icebreakers/monorepo-templates', 'monorepo-templates')

  const installedTemplates = path.join(bootstrapDir, 'node_modules/@icebreakers/monorepo-templates')
  assert.equal(readJson(path.join(installedTemplates, 'assets/package.json')).packageManager, sourceManifest.packageManager)
  const reportedManager = run(process.execPath, [
    '--input-type=module',
    '--eval',
    'import { getWorkspacePackageManager } from "@icebreakers/monorepo-templates"; process.stdout.write(await getWorkspacePackageManager())',
  ], bootstrapDir)
  assert.equal(reportedManager, sourceManifest.packageManager)

  console.log('Creating a monorepo with the packed CLI...')
  const cliPath = path.join(bootstrapDir, 'node_modules/create-repoctl/bin/create-repoctl.js')
  const workspaceDir = path.join(tempRoot, 'workspace')
  const output = run(process.execPath, [cliPath, workspaceDir, '--yes', '--templates', 'tsdown'], bootstrapDir)
  checkWorkspace(workspaceDir)
  assert.ok(output.includes('  corepack enable\n  pnpm install\n'), 'next steps must enable Corepack before installation')

  // All internal dependencies must exercise this checkout's published files.
  // External packages can reuse the pnpm store populated by the CI install.
  for (const directory of readdirSync(path.join(repoRoot, 'packages'), { withFileTypes: true })) {
    if (directory.isDirectory()) {
      const manifest = readJson(path.join(repoRoot, 'packages', directory.name, 'package.json'))
      if (!manifest.private) {
        pack(manifest.name)
      }
    }
  }
  installConsumer(workspaceDir, tarballs, run)

  console.log('Checking the compatibility creator and an empty workspace...')
  extractPackage(tarballs.get('create-icebreaker'), 'create-icebreaker')
  const compatibilityCli = path.join(bootstrapDir, 'node_modules/create-icebreaker/bin/create-icebreaker.js')
  assert.ok(run(process.execPath, [compatibilityCli, '--help'], bootstrapDir).includes('create-icebreaker'))
  const emptyWorkspace = path.join(tempRoot, 'empty-workspace')
  run(process.execPath, [compatibilityCli, emptyWorkspace, '--yes'], bootstrapDir)
  assertConsumerContract(emptyWorkspace)
  // The empty project has the same root dependencies, so reuse the installed
  // consumer tree without adding source-workspace package links.
  symlinkSync(path.join(workspaceDir, 'node_modules'), path.join(emptyWorkspace, 'node_modules'), 'junction')
  run('pnpm', ['run', 'test'], emptyWorkspace)

  // Launch from the source root so Corepack selects its pnpm, then verify that
  // the generated project's policy rejects that pnpm when its version differs.
  const manifestPath = path.join(workspaceDir, 'package.json')
  const manifest = readJson(manifestPath)
  manifest.packageManager = sourceManifest.packageManager === 'pnpm@1.0.0' ? 'pnpm@2.0.0' : 'pnpm@1.0.0'
  writeFileSync(manifestPath, JSON.stringify(manifest))
  assert.throws(
    () => run('pnpm', ['--dir', workspaceDir, 'exec', 'node', '--eval', 'process.stdout.write("unexpected execution")'], repoRoot),
    error => String(error.stderr).includes('ERR_PNPM_BAD_PM_VERSION'),
    'generated workspaces must reject a mismatched pnpm version',
  )
  console.log(`Packaged create smoke passed with ${sourceManifest.packageManager}.`)
}
finally {
  rmSync(tempRoot, { force: true, recursive: true })
}
