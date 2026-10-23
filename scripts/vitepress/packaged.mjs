import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import YAML from 'yaml'
import { checkDocsEnvironment, checkVitepressCache } from '../docs-context/cache.mjs'
import { packDependencies, registry } from '../packaged-template/workspace.mjs'
import { checkWebsiteArtifacts } from './artifacts.mjs'
import { checkWebsiteBrowser } from './browser.mjs'
import { writeDiagramFixtures } from './fixtures.mjs'

export async function checkPackagedWebsite({ cliPath, bootstrapDir, tempRoot, run }) {
  const workspace = path.join(tempRoot, 'docs-workspace')
  run(process.execPath, [cliPath, workspace, '--yes', '--templates', 'vitepress'], bootstrapDir)
  const website = path.join(workspace, 'apps/website')
  const rootManifest = JSON.parse(readFileSync(path.join(workspace, 'package.json'), 'utf8'))
  const workflow = readFileSync(path.join(workspace, '.github/workflows/ci.yml'), 'utf8')
  assert.equal(rootManifest.devDependencies.playwright, undefined)
  assert.ok(Object.values(rootManifest.devDependencies).every(version => !version.startsWith('workspace:')), 'generated tooling dependencies must be installable from the registry')
  assert.ok(!workflow.includes('playwright install') && !workflow.includes('test:packaged-create'), 'source acceptance jobs must not leak into generated CI')
  const manifest = JSON.parse(readFileSync(path.join(website, 'package.json'), 'utf8'))
  assert.equal(manifest.devDependencies.vitepress, '2.0.0-alpha.20')
  assert.equal(manifest.devDependencies['vitepress-plugin-mermaid'], undefined)
  assert.equal(manifest.devDependencies.repoctl, 'latest')
  assert.ok(!JSON.stringify(manifest).includes('workspace:'), 'template dependencies are installable')
  writeDiagramFixtures(website)
  writeFileSync(path.join(website, 'public/_headers'), '/*\n  X-Frame-Options: DENY\n')
  const packDir = path.join(tempRoot, 'docs-packs')
  mkdirSync(packDir)
  const overrides = packDependencies(packDir)
  const workspaceFile = path.join(workspace, 'pnpm-workspace.yaml')
  const config = YAML.parse(readFileSync(workspaceFile, 'utf8'))
  config.overrides = { ...config.overrides, ...overrides }
  writeFileSync(workspaceFile, YAML.stringify(config))
  // Install the generated project independently: no node_modules links to the source workspace.
  run('corepack', ['enable'], workspace)
  run('pnpm', ['install', '--ignore-scripts', '--registry', registry], workspace)
  for (const channel of ['preview', 'stable', 'preview']) {
    run('pnpm', ['--filter', '@icebreakers/website', 'run', 'build'], workspace, {
      REPO_DOCS_CHANNEL: channel,
      REPO_DOCS_URL: channel === 'preview' ? 'https://next.repo.icebreaker.top' : 'https://repo.icebreaker.top',
    })
    checkWebsiteArtifacts(website, channel)
    assert.ok(readFileSync(path.join(website, '.vitepress/dist/_headers'), 'utf8').includes('X-Frame-Options: DENY'))
    await checkWebsiteBrowser(website, channel)
  }
  for (const task of ['lint', 'typecheck', 'test']) {
    run('pnpm', ['--filter', '@icebreakers/website', 'run', task], workspace)
  }
  checkVitepressCache(workspace, website)
  checkDocsEnvironment(workspace, ['@icebreakers/website'])
  console.log('Packaged VitePress install, build, types, tests, and browser checks passed.')
}
