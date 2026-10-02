import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/** Verify registry and offline reconstruction using only the extracted published package. */
export async function checkPackagedTemplateOrigins(workspaceDir, templatesDir, tempRoot) {
  const templates = await import(pathToFileURL(path.join(templatesDir, 'dist/index.mjs')).href)
  const [record] = await templates.listTemplateInstances(workspaceDir)
  assert.ok(record, 'packed creation must register its template instance')
  assert.equal(record.instance.template, 'tsdown')
  assert.equal(record.instance.target, 'packages/tsdown')
  assert.equal(record.instance.generator.profile, 'workspace-copy-v1')
  assert.equal(record.baselineStatus, 'available')
  assert.equal(record.instance.source.version, JSON.parse(readFileSync(path.join(templatesDir, 'package.json'), 'utf8')).version)
  const original = await templates.captureTemplateSnapshot(path.join(templatesDir, 'templates/tsdown'))
  assert.equal(record.instance.source.digest, templates.snapshotDigest(original))
  const destination = path.join(tempRoot, 'offline-template-baseline')
  await templates.rebuildTemplateInstanceBaseline(workspaceDir, record.instance.id, destination)
  assert.deepEqual(await templates.captureTemplateSnapshot(destination), await templates.captureTemplateSnapshot(path.join(workspaceDir, 'packages/tsdown')))
  console.log('Packaged template origin registration and offline reconstruction passed.')
}
