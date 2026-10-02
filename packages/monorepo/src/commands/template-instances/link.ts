import type { TemplateInstanceDraft } from '@icebreakers/monorepo-templates'
import type { TemplateLinkOptions, TemplateLinkPlan } from './types'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { canVerifyTemplateInstance, captureTemplateSnapshot, compareTemplateSnapshots, generationParameters, getTemplateDefinition, instanceRelativePath, isExactTemplateVersion, loadTemplateBaseline, loadTemplateInstanceRegistry, registerTemplateInstances, safeInstancePath, snapshotDigest, templateInstanceId } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import { version } from '../../constants'
import { renderHistoricalTemplate } from './source'

function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function normalizeOptions(input: TemplateLinkOptions): TemplateLinkOptions {
  if (!isExactTemplateVersion(input.version)) {
    throw new Error('Template linking requires an exact historical package version; floating tags and ranges are not supported.')
  }
  if (!/^[a-z\d][a-z\d-]*$/iu.test(input.template)) {
    throw new Error('Template linking requires a stable template key.')
  }
  const profile = input.profile ?? 'repo-new-v1'
  if (!['workspace-copy-v1', 'repo-new-v1'].includes(profile)) {
    throw new Error('Unsupported template generation profile.')
  }
  const cwd = path.resolve(input.cwd)
  const target = instanceRelativePath(cwd, path.resolve(cwd, input.target))
  const parameters = generationParameters(input.parameters)
  if (profile === 'repo-new-v1') {
    parameters.packageName ??= path.basename(target)
    parameters.renameJson ??= false
  }
  else if (Object.keys(parameters).length) {
    throw new Error('The workspace-copy-v1 profile does not accept project rewrite parameters.')
  }
  return { cwd, target, template: input.template, version: input.version, profile, parameters, allowUnverified: input.allowUnverified === true, ...(input.sourceDir ? { sourceDir: path.resolve(cwd, input.sourceDir) } : {}) }
}

async function prepareLink(input: TemplateLinkOptions) {
  const options = normalizeOptions(input)
  const safeTarget = await safeInstancePath(options.cwd, options.target)
  options.target = instanceRelativePath(await fs.realpath(options.cwd), await fs.realpath(safeTarget))
  const registry = await loadTemplateInstanceRegistry(options.cwd)
  const target = await captureTemplateSnapshot(await safeInstancePath(options.cwd, options.target))
  const existing = registry.instances.find(item => item.target === options.target)
  let draft: TemplateInstanceDraft | undefined
  if (!options.sourceDir && existing?.template === options.template && existing.source.version === options.version
    && existing.generator.profile === options.profile && JSON.stringify(existing.parameters) === JSON.stringify(options.parameters)
    && existing.baseline.status === 'available') {
    const original = await loadTemplateBaseline(options.cwd, existing.baseline.original)
    const rendered = await loadTemplateBaseline(options.cwd, existing.baseline.rendered)
    draft = { instance: existing, snapshots: { [existing.baseline.original]: original, [existing.baseline.rendered]: rendered } }
  }
  else {
    const baseline = await renderHistoricalTemplate(options)
    const originalDigest = baseline ? snapshotDigest(baseline.original.snapshot) : undefined
    const renderedDigest = baseline ? snapshotDigest(baseline.rendered) : undefined
    draft = {
      instance: {
        id: templateInstanceId(options.target, options.template),
        target: options.target,
        template: options.template,
        provenance: 'linked',
        source: baseline?.original.source ?? {
          kind: 'package',
          packageName: '@icebreakers/monorepo-templates',
          version: options.version,
          templatePath: `templates/${getTemplateDefinition(options.template)?.source ?? options.template}`,
        },
        generator: { profile: options.profile!, version },
        parameters: options.parameters!,
        baseline: originalDigest && renderedDigest ? { status: 'available', original: originalDigest, rendered: renderedDigest } : { status: 'unverified', reason: 'source-unavailable' },
      },
      snapshots: baseline && originalDigest && renderedDigest ? { [originalDigest]: baseline.original.snapshot, [renderedDigest]: baseline.rendered } : {},
    }
  }
  const baseline = draft.instance.baseline
  const same = existing && digest({ ...existing, id: '', provenance: '' }) === digest({ ...draft.instance, id: '', provenance: '' })
  const overlap = registry.instances.some(item => item.target !== options.target && (item.target.startsWith(`${options.target}/`) || options.target.startsWith(`${item.target}/`)))
  const verifiable = existing && canVerifyTemplateInstance(existing, draft.instance)
  const action: TemplateLinkPlan['action'] = overlap || (existing && !same && !verifiable) ? 'conflict' : same ? 'unchanged' : verifiable ? 'verify' : 'register'
  const content = {
    schemaVersion: 1 as const,
    options,
    target: options.target,
    source: draft.instance.source,
    baselineStatus: baseline.status,
    action,
    limitations: baseline.status === 'available' ? [] : ['source-unavailable', 'reliable-upgrade-unavailable', 'upstream-comparison-unavailable'],
    differences: baseline.status === 'available' ? compareTemplateSnapshots(draft.snapshots[baseline.rendered]!, target) : [],
    registryDigest: digest(registry),
    targetDigest: snapshotDigest(target),
  }
  const plan: TemplateLinkPlan = { ...content, fingerprint: digest(content) }
  return { plan, draft }
}

export async function planTemplateLink(options: TemplateLinkOptions): Promise<TemplateLinkPlan> {
  return (await prepareLink(options)).plan
}

export async function applyTemplateLinkPlan(plan: TemplateLinkPlan) {
  const current = await prepareLink(plan.options)
  const { fingerprint, ...content } = plan
  if (digest(content) !== fingerprint || current.plan.fingerprint !== fingerprint) {
    throw new Error('Template link plan is stale; target files, source, or registry changed. Preview again before applying.')
  }
  if (current.plan.action === 'conflict') {
    throw new Error('Template link conflicts with an existing registered instance; no business files or registry entries were changed.')
  }
  if (current.plan.baselineStatus === 'unverified' && !current.plan.options.allowUnverified) {
    throw new Error('Historical source is unavailable. Provide the exact extracted package or explicitly allow an unverified association.')
  }
  await registerTemplateInstances(current.plan.options.cwd, [current.draft], async (registry) => {
    const target = await captureTemplateSnapshot(await safeInstancePath(current.plan.options.cwd, current.plan.target))
    if (digest(registry) !== current.plan.registryDigest || snapshotDigest(target) !== current.plan.targetDigest) {
      throw new Error('Template link plan became stale before metadata commit; preview again.')
    }
  })
  return { ...current.plan, applied: true }
}
