import type { TemplateInstance, TemplateInstanceDraft, TemplateSnapshot } from '@icebreakers/monorepo-templates'
import type { TemplateUpgradeOptions, TemplateUpgradePlan } from './types'
import fs from 'node:fs/promises'
import { instanceRelativePath, isExactTemplateVersion, loadTemplateBaseline, loadTemplateInstanceRegistry, normalizeTemplateExclusions, safeInstancePath, snapshotDigest } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import { version } from '../../../constants'
import { computeTemplateUpgradeChanges, snapshotEntries } from './changes'
import { captureUpgradeTarget } from './current'
import { upgradeDigest } from './digest'
import { renderTemplateUpgradeSource } from './source'
import { loadTemplateUpgradeJournal } from './transaction/journal'

function nextInstance(previous: TemplateInstance, draft: { source: TemplateInstance['source'], original: TemplateSnapshot, rendered: TemplateSnapshot }, excludedPaths: string[]) {
  return {
    ...previous,
    source: draft.source,
    generator: { ...previous.generator, version },
    baseline: { status: 'available' as const, original: snapshotDigest(draft.original), rendered: snapshotDigest(draft.rendered) },
    ...(excludedPaths.length ? { excludedPaths } : {}),
  }
}

export async function prepareTemplateUpgrade(input: TemplateUpgradeOptions) {
  if (!isExactTemplateVersion(input.version)) {
    throw new Error('Template upgrades require an exact target package version; floating tags and ranges are not supported.')
  }
  const cwd = await fs.realpath(path.resolve(input.cwd))
  const registry = await loadTemplateInstanceRegistry(cwd)
  const instance = registry.instances.find(item => item.id === input.instance)
    ?? registry.instances.find(item => item.target === instanceRelativePath(cwd, path.resolve(cwd, input.instance)))
  if (!instance) {
    throw new Error(`Unknown template instance: ${input.instance}`)
  }
  if (instance.source.kind === 'remote') {
    throw new Error('This upgrade command accepts built-in template package versions. Remote source identity and retained baselines are preserved; remote npm/Git upgrades are not supported yet.')
  }
  if (await loadTemplateUpgradeJournal(cwd, instance.id)) {
    throw new Error(`This instance has a pending template upgrade. Inspect templates recover-upgrade ${instance.id} before starting another upgrade.`)
  }
  if (instance.baseline.status !== 'available') {
    throw new Error('This instance has no reliable historical baseline. Verify its historical source before upgrading.')
  }
  const original = await loadTemplateBaseline(cwd, instance.baseline.original)
  const baseline = await loadTemplateBaseline(cwd, instance.baseline.rendered)
  const excludedPaths = normalizeTemplateExclusions([...(instance.excludedPaths ?? []), ...(input.exclude ?? [])])
  const options: TemplateUpgradeOptions = {
    cwd,
    instance: instance.id,
    version: input.version,
    exclude: excludedPaths,
    ...(input.sourceDir ? { sourceDir: path.resolve(input.cwd, input.sourceDir) } : {}),
  }
  const sameVersion = instance.source.kind === 'package' && instance.source.version === input.version
  const source = sameVersion && !options.sourceDir
    ? { original: { source: instance.source, snapshot: original }, rendered: baseline }
    : await renderTemplateUpgradeSource(options, instance, baseline)
  if (sameVersion && snapshotDigest(source.original.snapshot) !== instance.baseline.original) {
    throw new Error('The selected source changed under the same package version. Use an immutable source with its correct version.')
  }
  if (sameVersion) {
    source.rendered = baseline
  }
  const snapshots = {
    [snapshotDigest(source.original.snapshot)]: source.original.snapshot,
    [snapshotDigest(source.rendered)]: source.rendered,
  }
  const next = sameVersion
    ? { ...instance, ...(excludedPaths.length ? { excludedPaths } : {}) }
    : nextInstance(instance, { source: source.original.source, original: source.original.snapshot, rendered: source.rendered }, excludedPaths)
  const current = await captureUpgradeTarget(await safeInstancePath(cwd, instance.target), [...snapshotEntries(baseline).keys(), ...snapshotEntries(source.rendered).keys()], excludedPaths)
  const changes = computeTemplateUpgradeChanges(baseline, current, source.rendered, excludedPaths)
  const action: TemplateUpgradePlan['action'] = changes.some(item => item.status === 'conflict')
    ? 'conflict'
    : upgradeDigest(next) === upgradeDigest(instance) && !changes.some(item => ['add', 'modify', 'delete'].includes(item.status)) ? 'unchanged' : 'upgrade'
  const content = {
    schemaVersion: 1 as const,
    options,
    instanceId: instance.id,
    target: instance.target,
    source: source.original.source,
    action,
    changes,
    registryDigest: upgradeDigest(registry),
    targetDigest: snapshotDigest(current),
    nextInstance: next,
  }
  const plan: TemplateUpgradePlan = { ...content, fingerprint: upgradeDigest(content) }
  return { plan, previous: instance, draft: { instance: next, snapshots } satisfies TemplateInstanceDraft }
}

export async function planTemplateUpgrade(options: TemplateUpgradeOptions): Promise<TemplateUpgradePlan> {
  return (await prepareTemplateUpgrade(options)).plan
}
