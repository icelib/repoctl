import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const tempRoot = mkdtempSync(path.join(tmpdir(), 'repoctl-packaged-doctor-'))
const packDir = path.join(tempRoot, 'packs')
const workspaceDir = path.join(tempRoot, 'workspace')
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

function run(args, cwd, stdio = 'inherit') {
  return execFileSync(pnpmCommand, args, {
    cwd,
    encoding: 'utf8',
    stdio,
  })
}

function discoverWorkspacePackages() {
  const packages = new Map()
  for (const root of ['packages', 'templates']) {
    const rootDir = path.join(repoRoot, root)
    for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue
      }
      const packageDir = path.join(rootDir, entry.name)
      const manifestPath = path.join(packageDir, 'package.json')
      if (!existsSync(manifestPath)) {
        continue
      }
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      if (manifest.name) {
        packages.set(manifest.name, { dir: packageDir, manifest })
      }
    }
  }
  return packages
}

function getWorkspaceDependencyClosure(packageNames, workspacePackages) {
  const visited = new Set()
  const closure = []
  function visit(packageName) {
    if (visited.has(packageName)) {
      return
    }
    visited.add(packageName)
    const packageInfo = workspacePackages.get(packageName)
    if (!packageInfo) {
      throw new Error(`workspace package ${packageName} is not defined`)
    }
    for (const dependencies of [packageInfo.manifest.dependencies, packageInfo.manifest.optionalDependencies]) {
      for (const [dependencyName, version] of Object.entries(dependencies ?? {})) {
        if (version.startsWith('workspace:') && workspacePackages.has(dependencyName)) {
          visit(dependencyName)
        }
      }
    }
    closure.push(packageName)
  }
  for (const packageName of packageNames) {
    visit(packageName)
  }
  return closure
}

function pack(packageDir) {
  const existing = new Set(readdirSync(packDir))
  run(['pack', '--pack-destination', packDir], packageDir, 'pipe')
  const tarball = readdirSync(packDir).find(file => file.endsWith('.tgz') && !existing.has(file))
  if (!tarball) {
    throw new Error(`pnpm pack did not create a tarball for ${packageDir}`)
  }
  return path.join(packDir, tarball)
}

try {
  mkdirSync(packDir, { recursive: true })
  mkdirSync(path.join(workspaceDir, 'packages', 'demo'), { recursive: true })
  mkdirSync(path.join(workspaceDir, '.husky'), { recursive: true })

  const workspacePackages = discoverWorkspacePackages()
  const packageNames = getWorkspaceDependencyClosure([
    '@icebreakers/monorepo-templates',
    '@icebreakers/monorepo',
    'repoctl',
  ], workspacePackages)
  const tarballs = new Map(packageNames.map(packageName => [
    packageName,
    pack(workspacePackages.get(packageName).dir),
  ]))
  const templatesTarball = tarballs.get('@icebreakers/monorepo-templates')
  const monorepoTarball = tarballs.get('@icebreakers/monorepo')
  const repoctlTarball = tarballs.get('repoctl')

  writeFileSync(path.join(workspaceDir, 'package.json'), `${JSON.stringify({
    name: 'repoctl-packaged-doctor-smoke',
    private: true,
    packageManager: 'pnpm@11.22.0',
    engines: { node: '>=22.12.0' },
    scripts: {
      'repo:init': 'repo init',
      'repo:new': 'repo new',
      'repo:check': 'repo check',
      'repo:doctor': 'repo doctor',
    },
  }, null, 2)}\n`)
  writeFileSync(path.join(workspaceDir, 'pnpm-workspace.yaml'), [
    'packages:',
    '  - apps/*',
    '  - packages/*',
    '  - examples/*',
    'overrides:',
    ...packageNames.map(packageName => `  ${JSON.stringify(packageName)}: ${JSON.stringify(`file:${tarballs.get(packageName)}`)}`),
    'versioning:',
    '  changelog:',
    '    storage: repository',
    '',
  ].join('\n'))
  writeFileSync(path.join(workspaceDir, 'repoctl.config.ts'), 'export default {}\n')
  writeFileSync(path.join(workspaceDir, 'lint-staged.config.js'), 'export default {}\n')
  writeFileSync(path.join(workspaceDir, '.husky', 'pre-commit'), 'pnpm exec lint-staged\n')
  writeFileSync(path.join(workspaceDir, 'packages', 'demo', 'package.json'), `${JSON.stringify({
    name: '@smoke/demo',
    version: '0.0.0',
    private: true,
  }, null, 2)}\n`)

  run(['add', '--workspace-root', '--save-dev', '--ignore-scripts', templatesTarball, monorepoTarball, repoctlTarball], workspaceDir)
  const manifest = JSON.parse(run(['--silent', 'exec', 'node', '-p', 'JSON.stringify(require("./package.json"))'], workspaceDir, 'pipe'))
  if (manifest.dependencies?.vitest || manifest.devDependencies?.vitest) {
    throw new Error('the smoke workspace must not declare Vitest')
  }
  const tsconfig = JSON.parse(run([
    '--silent',
    'exec',
    'node',
    '--input-type=module',
    '--eval',
    'import { createMonorepoTsconfig } from \'repoctl/tooling\'; process.stdout.write(JSON.stringify(createMonorepoTsconfig()))',
  ], workspaceDir, 'pipe'))
  if (tsconfig.compilerOptions?.target !== 'ESNext') {
    throw new Error('the packaged tooling entry must load the bundled tsconfig')
  }
  run(['exec', 'repoctl', 'doctor', '--strict'], workspaceDir)
}
finally {
  rmSync(tempRoot, { force: true, recursive: true })
}
