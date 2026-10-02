import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
const sourceManifest = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))

function run(args, cwd, stdio = 'inherit') {
  return execFileSync(pnpmCommand, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, HUSKY: '0', CI: 'true' },
    timeout: 180_000,
    stdio,
  })
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

  const templatesTarball = pack(path.join(repoRoot, 'packages', 'monorepo-templates'))
  const monorepoTarball = pack(path.join(repoRoot, 'packages', 'monorepo'))
  const repoctlTarball = pack(path.join(repoRoot, 'packages', 'repoctl'))

  writeFileSync(path.join(workspaceDir, 'package.json'), `${JSON.stringify({
    name: 'repoctl-packaged-doctor-smoke',
    private: true,
    packageManager: sourceManifest.packageManager,
    engines: sourceManifest.engines,
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
    `  '@icebreakers/monorepo': ${JSON.stringify(`file:${monorepoTarball}`)}`,
    `  '@icebreakers/monorepo-templates': ${JSON.stringify(`file:${templatesTarball}`)}`,
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
  const manifest = JSON.parse(run(['exec', 'node', '-p', 'JSON.stringify(require("./package.json"))'], workspaceDir, 'pipe'))
  if (manifest.dependencies?.vitest || manifest.devDependencies?.vitest) {
    throw new Error('the smoke workspace must not declare Vitest')
  }
  const tsconfig = JSON.parse(run([
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
