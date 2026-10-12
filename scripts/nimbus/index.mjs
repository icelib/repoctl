import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createWorkspace, json, run } from '../packaged-template/workspace.mjs'
import { checkDiscovery } from './discovery.mjs'
import { checkCache, checkDrafts, checkOutput, checkUpgrade, checkValidation } from './output.mjs'

const tempRoot = mkdtempSync(path.join(tmpdir(), 'repoctl-packaged-nimbus-'))
console.log(`Nimbus regression workspace: ${tempRoot}`)

try {
  const workspace = createWorkspace(tempRoot)
  const docs = path.join(workspace, 'apps/docs')
  const website = path.join(workspace, 'apps/website')
  const files = readdirSync(docs)
  for (const file of ['pnpm-lock.yaml', 'pnpm-workspace.yaml', '.astro', '.nimbus', 'dist']) {
    assert.ok(!files.includes(file), `generated template must not ship ${file}`)
  }
  const manifest = json(path.join(workspace, 'package.json'))
  const workflow = readFileSync(path.join(workspace, '.github/workflows/ci.yml'), 'utf8')
  for (const script of ['test:packaged-nimbus', 'check:nimbus-upgrade']) {
    assert.equal(manifest.scripts[script], undefined)
    assert.ok(!workflow.includes(script), `generated CI must not reference ${script}`)
  }
  assert.ok(!JSON.stringify(manifest).includes('scripts/nimbus/'), 'generated manifest must not reference source Nimbus scripts')
  assert.ok(!workflow.includes('scripts/nimbus/'), 'generated CI must not reference source Nimbus scripts')
  checkUpgrade(docs)
  console.log('Building and checking both documentation engines…')
  run('pnpm', ['build'], docs)
  run('pnpm', ['lint'], docs)
  run('pnpm', ['typecheck'], docs)
  run('pnpm', ['build'], website)
  checkOutput(docs)
  checkDiscovery(docs)
  checkCache(workspace, docs)
  checkValidation(docs)
  checkDrafts(docs)
  run('pnpm', ['exec', 'repo', 'new', 'another-guide', '--template', 'nimbus', '--dry-run', '--json', '--out', 'plan.json'], workspace)
  const plan = json(path.join(workspace, 'plan.json'))
  assert.equal(plan.template, 'nimbus')
  assert.equal(plan.targetName, 'apps/another-guide')
  console.log('Packaged Nimbus regression passed: upgrade baseline, bilingual pages, discovery, endpoints, drafts, cache and CLI.')
}
finally {
  if (process.env.NIMBUS_SMOKE_KEEP !== '1') {
    rmSync(tempRoot, { recursive: true, force: true })
  }
}
