import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
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
  writeDiagramFixtures(website)
  // Install the generated project independently: no node_modules links to the source workspace.
  run('corepack', ['enable'], workspace)
  run('pnpm', ['install', '--ignore-scripts'], workspace)
  for (const task of ['build', 'lint', 'typecheck', 'test']) {
    run('pnpm', ['--filter', '@icebreakers/website', 'run', task], workspace)
  }
  checkWebsiteArtifacts(website)
  await checkWebsiteBrowser(website)
  console.log('Packaged VitePress install, build, types, tests, and browser checks passed.')
}
