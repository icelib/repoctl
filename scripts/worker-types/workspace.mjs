import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execaSync } from 'execa'
import YAML from 'yaml'

export const repoRoot = path.resolve(import.meta.dirname, '../..')
export const declarations = '.cloudflare/types/index.d.ts'

export function run(command, args, cwd, success = true) {
  const result = execaSync(command, args, {
    cwd,
    reject: false,
    env: { WRANGLER_SEND_METRICS: 'false', TURBO_TELEMETRY_DISABLED: '1' },
    timeout: 180_000,
  })
  if (success) {
    assert.equal(result.exitCode, 0, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`)
  }
  else {
    assert.notEqual(result.exitCode, 0, `${command} unexpectedly succeeded`)
  }
  return success ? result.stdout : `${result.stdout}\n${result.stderr}`
}

export function json(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

export function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

// Reuse installed dependencies, but keep compiler caches inside the fixture.
// Directory junctions also work on Windows without symlink privileges.
function linkDependencies(source, target) {
  mkdirSync(target, { recursive: true })
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (['.tmp', '.cache', '.turbo'].includes(entry.name) || entry.isFile()) {
      continue
    }
    const from = path.join(source, entry.name)
    const to = path.join(target, entry.name)
    if (entry.name.startsWith('@')) {
      linkDependencies(from, to)
    }
    else {
      symlinkSync(from, to, 'junction')
    }
  }
}

export async function createWorkspace(tempRoot, includeDocs = false) {
  const names = includeDocs ? ['client', 'server', 'vitepress'] : ['client', 'server']
  const packDir = path.join(tempRoot, 'pack')
  mkdirSync(packDir)
  run('pnpm', ['--filter', '@icebreakers/monorepo-templates', 'pack', '--pack-destination', packDir], repoRoot)
  const tarball = readdirSync(packDir).find(file => file.endsWith('.tgz'))
  assert.ok(tarball, 'the templates package must be packed')
  run('tar', ['-xf', path.join(packDir, tarball), '-C', packDir], repoRoot)
  const packedRoot = path.join(packDir, 'package')
  assert.ok(!readFileSync(path.join(packedRoot, 'assets/.github/workflows/ci.yml'), 'utf8').includes('pnpm test:worker-types'), 'source repository regression checks must not leak into generated CI')
  assert.equal(json(path.join(packedRoot, 'assets/package.json')).scripts['test:worker-types'], undefined)
  linkDependencies(path.join(repoRoot, 'packages/monorepo-templates/node_modules'), path.join(packedRoot, 'node_modules'))
  const { scaffoldWorkspace } = await import(pathToFileURL(path.join(packedRoot, 'dist/index.mjs')).href)
  const workspace = path.join(tempRoot, 'workspace')
  await scaffoldWorkspace({ targetDir: workspace, templateKeys: ['vue-hono', 'hono-server', ...(includeDocs ? ['vitepress'] : [])], includeAssets: false })
  for (const name of names) {
    assert.ok(!readdirSync(path.join(packedRoot, 'templates', name)).includes('.cloudflare'), 'packed templates must exclude generated declarations')
    linkDependencies(path.join(repoRoot, 'templates', name, 'node_modules'), path.join(workspace, 'apps', name === 'vitepress' ? 'website' : name, 'node_modules'))
  }
  linkDependencies(path.join(repoRoot, 'node_modules'), path.join(workspace, 'node_modules'))
  const manifest = json(path.join(repoRoot, 'package.json'))
  writeJson(path.join(workspace, 'package.json'), {
    name: 'worker-types-regression',
    private: true,
    packageManager: manifest.packageManager,
    scripts: { build: 'turbo run build', typecheck: 'turbo run typecheck' },
  })
  writeFileSync(path.join(workspace, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n')
  const documents = YAML.parseAllDocuments(readFileSync(path.join(repoRoot, 'pnpm-lock.yaml'), 'utf8')).map(doc => doc.toJS())
  const lock = documents.find(doc => doc.importers?.['templates/client'])
  assert.ok(lock, 'the lockfile must describe the source templates')
  for (const name of names) {
    lock.importers[`apps/${name === 'vitepress' ? 'website' : name}`] = lock.importers[`templates/${name}`]
    delete lock.importers[`templates/${name}`]
  }
  writeFileSync(path.join(workspace, 'pnpm-lock.yaml'), documents.map(doc => `---\n${YAML.stringify(doc)}`).join('\n'))
  cpSync(path.join(packedRoot, 'assets/turbo.json'), path.join(workspace, 'turbo.json'))
  writeJson(path.join(workspace, 'tsconfig.json'), { extends: 'repoctl/tsconfig.json', compilerOptions: { ignoreDeprecations: '6.0' }, files: [] })
  cpSync(path.join(packedRoot, 'assets/gitignore'), path.join(workspace, '.gitignore'))
  run('git', ['init', '--quiet'], workspace)
  run('git', ['add', '.'], workspace)
  return workspace
}

export function createTempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'repoctl-worker-types-'))
}
