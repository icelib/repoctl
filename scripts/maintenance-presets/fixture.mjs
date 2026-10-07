import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import YAML from 'yaml'
import { archiveFixturePackage } from '../packaged-template/archive.mjs'
import { json, packDependencies, repoRoot, run, writeJson } from '../packaged-template/workspace.mjs'

export const name = '@fixture/maintenance-preset'
export const target = 'scripts/team-check.mjs'
export const baseAsset = 'export const first = 1\nexport const second = 2\nexport const third = 3\nexport const fourth = 4\n'

export function archives(root) {
  const packs = path.join(root, 'packs')
  mkdirSync(packs)
  const overrides = packDependencies(packs)
  const templateArchive = overrides['@icebreakers/monorepo-templates'].slice(5)
  const generatedManifest = JSON.parse(execFileSync('tar', ['-xOf', templateArchive, 'package/assets/package.json'], { encoding: 'utf8' }))
  assert.equal(generatedManifest.devDependencies['make-fetch-happen'], undefined, 'Public metadata caching is source-only fixture tooling')
  assert.equal(generatedManifest.scripts['test:packaged-maintenance-presets'], undefined, 'Source fixture checks must not enter generated projects')
  const tool = overrides.repoctl.slice(5)
  const metadata = JSON.parse(execFileSync('tar', ['-xOf', tool, 'package/package.json'], { encoding: 'utf8' }))
  const catalog = [{ metadata, archive: tool }]
  delete overrides.repoctl
  const source = path.join(root, 'preset')
  mkdirSync(path.join(source, 'assets'), { recursive: true })
  const marker = path.join(root, 'preset-code-executed')
  writeFileSync(path.join(source, 'entry.cjs'), `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'unexpected')\n`)
  writeJson(path.join(source, 'repoctl.preset.json'), { schemaVersion: 1, requires: { repoctl: '>=5 <6' }, assets: [{ source: 'assets/check.mjs', target }] })
  for (const version of ['1.0.0', '2.0.0']) {
    const manifest = { name, version, exports: { '.': './entry.cjs' }, files: ['assets', 'repoctl.preset.json', 'entry.cjs'], scripts: { prepare: 'node entry.cjs', postinstall: 'node entry.cjs' } }
    writeJson(path.join(source, 'package.json'), manifest)
    writeFileSync(path.join(source, 'assets/check.mjs'), version === '1.0.0' ? baseAsset : baseAsset.replace('first = 1', 'first = 10'))
    const archive = archiveFixturePackage(source, path.join(packs, `fixture-maintenance-preset-${version}.tgz`), ['package.json', 'entry.cjs', 'repoctl.preset.json', 'assets/check.mjs'])
    assert.ok(!existsSync(marker), 'Fixture archive construction must not execute preset scripts')
    catalog.push({ metadata: manifest, archive })
  }
  const catalogFile = path.join(root, 'catalog.json')
  writeJson(catalogFile, catalog)
  return { catalogFile, overrides, toolVersion: metadata.version, marker }
}

export function consumer(root, fixture, registry, localValue) {
  mkdirSync(root)
  mkdirSync(path.join(root, 'tests'))
  const packageFile = path.join(root, 'package.json')
  const manifest = {
    name: `consumer-${localValue}`,
    private: true,
    type: 'module',
    packageManager: json(path.join(repoRoot, 'package.json')).packageManager,
    scripts: { build: `node --check ${target}`, lint: `node --check ${target}`, test: 'node --test tests/asset.test.mjs' },
    devDependencies: { repoctl: fixture.toolVersion, [name]: '1.0.0' },
  }
  writeJson(packageFile, manifest)
  // The source workspace explicitly allows same-day package validation. Keep
  // the isolated consumer on that policy even when the CI runner configures a
  // global minimum release age for ordinary installs.
  writeFileSync(path.join(root, 'pnpm-workspace.yaml'), YAML.stringify({ packages: [], minimumReleaseAge: 0, overrides: fixture.overrides }))
  writeFileSync(path.join(root, '.npmrc'), `registry=${registry}\n`)
  writeFileSync(path.join(root, '.gitignore'), 'node_modules\n')
  writeFileSync(path.join(root, 'tests/asset.test.mjs'), `import assert from 'node:assert/strict'\nimport { first, fourth } from '../${target}'\nassert.equal(first, 10)\nassert.equal(fourth, ${localValue})\n`)
  const configure = version => writeFileSync(path.join(root, 'repoctl.config.mjs'), `export default ${JSON.stringify({ presets: [{ packageName: name, version }] })}\n`)
  configure('1.0.0')
  run('corepack', ['enable'], root)
  run('pnpm', ['install', '--ignore-scripts'], root)
  assert.ok(!existsSync(fixture.marker), 'Installing the fixture must not execute preset scripts')
  const cli = path.join(root, 'node_modules/repoctl/bin/repoctl.js')
  const invoke = args => execFileSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', timeout: 240_000, env: { ...process.env, CI: 'true', GITHUB_REPOSITORY: 'acme/example', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1' } })
  const planFile = path.join(path.dirname(root), `plan-${localValue}.json`)
  invoke(['presets', 'plan', '--out', planFile, '--json'])
  invoke(['presets', 'apply', planFile, '--json'])
  writeFileSync(path.join(root, target), baseAsset.replace('fourth = 4', `fourth = ${localValue}`))
  invoke(['maintenance', 'workflow', '--out', '.github/workflows/repoctl-upgrade.yml'])
  const workflow = readFileSync(path.join(root, '.github/workflows/repoctl-upgrade.yml'), 'utf8')
  const git = args => run('git', args, root).trim()
  git(['init', '-q', '-b', 'main'])
  git(['config', 'user.name', 'Fixture'])
  git(['config', 'user.email', 'fixture@example.com'])
  const commit = (message) => {
    git(['add', '.'])
    git(['-c', 'commit.gpgsign=false', 'commit', '-qm', message])
    return git(['rev-parse', 'HEAD'])
  }
  const base = commit('adopt preset one')
  manifest.devDependencies[name] = '2.0.0'
  writeJson(packageFile, manifest)
  configure('2.0.0')
  run('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts'], root)
  assert.ok(!existsSync(fixture.marker), 'Updating the fixture must not execute preset scripts')
  const head = commit('upgrade fixed preset')
  return { root, invoke, git, commit, base, head, workflow }
}
