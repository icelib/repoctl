import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

const repoRoot = path.resolve(import.meta.dirname, '..')
const tempRoot = mkdtempSync(path.join(tmpdir(), 'repoctl-packaged-create-'))
const packDir = path.join(tempRoot, 'packs')
const bootstrapDir = path.join(tempRoot, 'bootstrap')
const sourceManifest = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
const sourceNpmrc = readFileSync(path.join(repoRoot, '.npmrc'), 'utf8')

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, HUSKY: '0', CI: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 180_000,
  })
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function pack(packageName) {
  const existing = new Set(readdirSync(packDir))
  run('pnpm', ['--filter', packageName, 'pack', '--pack-destination', packDir], repoRoot)
  const tarballs = readdirSync(packDir).filter(file => file.endsWith('.tgz') && !existing.has(file))
  assert.equal(tarballs.length, 1, `one tarball must be created for ${packageName}`)
  return path.join(packDir, tarballs[0])
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
