import type { TemplateInstance, TemplateSnapshot } from '@icebreakers/monorepo-templates'
import type { TemplateUpgradeOptions } from './types'
import { Buffer } from 'node:buffer'
import { renderHistoricalTemplate } from '../source'

/** Retain the original generation identity rather than sampling the current machine's Git configuration. */
function preserveGenerationMetadata(snapshot: TemplateSnapshot, previous: TemplateSnapshot, instance: TemplateInstance) {
  if (!['repo-new-v1', 'repo-new-parameters-v1'].includes(instance.generator.profile)) {
    return snapshot
  }
  const filename = instance.parameters.renameJson ? 'package.mock.json' : 'package.json'
  const before = previous.files.find(file => file.path === filename)
  const after = snapshot.files.find(file => file.path === filename)
  if (!before || !after) {
    return snapshot
  }
  const original = JSON.parse(Buffer.from(before.content, 'base64').toString('utf8')) as Record<string, unknown>
  const next = JSON.parse(Buffer.from(after.content, 'base64').toString('utf8')) as Record<string, unknown>
  for (const key of ['author', 'bugs', 'repository']) {
    if (Object.hasOwn(original, key)) {
      next[key] = original[key]
    }
  }
  after.content = Buffer.from(`${JSON.stringify(next, null, 2)}\n`).toString('base64')
  return snapshot
}

export async function renderTemplateUpgradeSource(options: TemplateUpgradeOptions, instance: TemplateInstance, previous: TemplateSnapshot) {
  const rendered = await renderHistoricalTemplate({
    cwd: options.cwd,
    target: instance.target,
    template: instance.template,
    version: options.version,
    profile: instance.generator.profile,
    parameters: instance.parameters,
    ...((options.exclude ?? instance.excludedPaths) ? { excludedPaths: options.exclude ?? instance.excludedPaths } : {}),
    ...(options.sourceDir ? { sourceDir: options.sourceDir } : {}),
  })
  if (!rendered) {
    throw new Error('The exact requested template source is unavailable. Supply its extracted package; no instance files were changed.')
  }
  return { original: rendered.original, rendered: preserveGenerationMetadata(rendered.rendered, previous, instance) }
}
