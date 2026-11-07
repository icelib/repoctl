import type { Dirent } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
// eslint-disable-next-line e18e/ban-dependencies -- 隔离消费者探针使用 execa 解析 Windows 的 pnpm.cmd。
import { execa } from 'execa'
import YAML from 'yaml'

interface Manifest {
  name: string
  packageManager?: string
  dependencies?: Record<string, string>
}

const workspace = path.resolve(import.meta.dirname, '../../..')

async function readManifest(file: string) {
  return JSON.parse(await readFile(file, 'utf8')) as Manifest
}

async function packConfigs(directory: string) {
  const packages = new Map<string, string>()
  const entries: Dirent[] = await readdir(path.join(workspace, 'packages'), { withFileTypes: true })
  for (const entry of entries.filter(entry => entry.isDirectory())) {
    const root = path.join(workspace, 'packages', entry.name)
    packages.set((await readManifest(path.join(root, 'package.json'))).name, root)
  }
  const overrides: Record<string, string> = {}
  async function visit(name: string) {
    if (overrides[name]) {
      return
    }
    const root = packages.get(name)
    if (!root) {
      throw new Error(`Missing workspace package ${name}`)
    }
    const before = new Set(await readdir(directory))
    await execa('pnpm', ['--filter', name, 'pack', '--pack-destination', directory], { cwd: workspace, timeout: 120_000 })
    const archives = (await readdir(directory)).filter(file => file.endsWith('.tgz') && !before.has(file))
    expect(archives).toHaveLength(1)
    overrides[name] = `file:${path.join(directory, archives[0]!)}`
    const manifest = await readManifest(path.join(root, 'package.json'))
    for (const [dependency, version] of Object.entries(manifest.dependencies ?? {})) {
      if (version.startsWith('workspace:')) {
        await visit(dependency)
      }
    }
  }
  await visit('@icebreakers/eslint-config')
  return overrides
}

const consumerProbe = `
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import stylelint from 'stylelint'
import { createStylelintConfig } from '@icebreakers/stylelint-config'
import { resolveStylelintConfig } from '@icebreakers/eslint-config/stylelint'

const config = createStylelintConfig({ miniProgram: true })
const bridge = resolveStylelintConfig({ miniProgram: true })
for (const [filename, code] of [
  ['valid.css', '.page-shell { color: red; }'],
  ['valid.scss', '@mixin good-name { color: red; }'],
  ['values.scss', '.page-shell { background: linear-gradient(90deg, $first, $second); border: 2px solid $border-color; }'],
  ['valid.vue', '<template><div /></template><style lang="scss">.page-shell { color: v-bind(color); }</style>'],
  ['values.vue', '<style lang="scss">.page-shell { border: 2px solid $border-color; }</style>'],
  ['valid.wxss', 'page { width: 10rpx; }'],
]) {
  const result = await stylelint.lint({ code, codeFilename: filename, config })
  assert.equal(result.errored, false, JSON.stringify(result.results.map(result => result.warnings)))
  assert.deepEqual(result.results[0].warnings, [])
}
for (const [filename, code, rule] of [
  ['invalid.css', '.page-shell { width: 10unknown; }', 'unit-no-unknown'],
  ['invalid.scss', '@mixin bad_name { color: red; }', 'scss/at-mixin-pattern'],
  ['invalid.vue', '<style lang="scss">@mixin bad_name { color: red; }</style>', 'scss/at-mixin-pattern'],
  ['invalid.wxss', '.Bad_Name { width: 10rpx; }', 'selector-class-pattern'],
]) {
  const result = await stylelint.lint({ code, codeFilename: filename, config })
  assert.equal(result.errored, true)
  assert(result.results[0].warnings.some(warning => warning.rule === rule), JSON.stringify(result.results.map(result => result.warnings)))
}
const unordered = '.page-shell {\\n  color: red;\\n  display: block;\\n}'
const orderError = await stylelint.lint({ code: unordered, codeFilename: 'order.css', config })
assert(orderError.results[0].warnings.some(warning => warning.rule === 'order/properties-order'))
const fixed = await stylelint.lint({ code: unordered, codeFilename: 'order.css', config, fix: true })
assert.equal(fixed.errored, false)
assert(fixed.code.indexOf('display: block') < fixed.code.indexOf('color: red'))
const bridged = await stylelint.lint({ code: 'page { width: 10rpx; }', codeFilename: 'bridge.wxss', config: bridge })
assert.equal(bridged.errored, false)
const lock = await fs.readFile('pnpm-lock.yaml', 'utf8')
for (const dependency of ['stylelint-scss@', 'stylelint-config-recommended-scss@', 'stylelint-config-recommended-vue@', 'stylelint-config-recess-order@']) assert(!lock.includes(dependency), dependency)
console.log('Strict packaged consumer: CSS/SCSS/Vue/WXSS valid/invalid cases, property order fix and ESLint bridge passed.')
`

it('installs published lint configs with strict peers and preserves style rules without source overrides', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'repoctl-strict-stylelint-'))
  try {
    const packs = path.join(root, 'packs')
    const consumer = path.join(root, 'consumer')
    await mkdir(packs)
    await mkdir(consumer)
    const overrides = await packConfigs(packs)
    const manifest = await readManifest(path.join(workspace, 'package.json'))
    await writeFile(path.join(consumer, 'package.json'), JSON.stringify({
      private: true,
      type: 'module',
      packageManager: manifest.packageManager,
      devDependencies: {
        '@icebreakers/eslint-config': overrides['@icebreakers/eslint-config'],
        '@icebreakers/stylelint-config': overrides['@icebreakers/stylelint-config'],
        'eslint': '10.14.0',
        'stylelint': '18.0.0',
        'typescript': '6.0.3',
      },
    }))
    await writeFile(path.join(consumer, 'pnpm-workspace.yaml'), YAML.stringify({ packages: [], minimumReleaseAge: 0, overrides }))
    await writeFile(path.join(consumer, 'probe.mjs'), consumerProbe)
    await execa('pnpm', ['install', '--strict-peer-dependencies', '--ignore-scripts', '--registry', 'https://registry.npmjs.org'], {
      cwd: consumer,
      timeout: 240_000,
      env: { CI: 'true' },
    })
    const result = await execa(process.execPath, ['probe.mjs'], { cwd: consumer, timeout: 120_000 })
    expect(result.stdout).toContain('ESLint bridge passed')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 300_000)
