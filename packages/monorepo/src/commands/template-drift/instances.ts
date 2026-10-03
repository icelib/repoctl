import type { TemplateInstance } from '@icebreakers/monorepo-templates'
import type { TemplateDriftFile, TemplateDriftOwner, TemplateDriftRegistry, TemplateVersionEvidence } from './types'
import { lstat } from 'node:fs/promises'
import { loadTemplateBaseline, loadTemplateInstanceRegistry, safeInstancePath, templateRegistryPath } from '@icebreakers/monorepo-templates'
import { compareManagedFile, errorDetail, isMissing, localDriftState, snapshotFileHash } from './files'
import { compareTemplateVersion } from './versions'

async function inspectInstance(workspaceDir: string, instance: TemplateInstance, evidence: TemplateVersionEvidence): Promise<TemplateDriftOwner> {
  const owner: TemplateDriftOwner = {
    kind: 'instance',
    id: instance.id,
    path: instance.target,
    template: instance.template,
    source: instance.source,
    baseline: { status: 'unverified', detail: 'No trustworthy historical baseline is registered.' },
    version: compareTemplateVersion(instance.source, evidence),
    local: 'unknown',
    files: [],
    recommendations: [],
  }
  if (instance.baseline.status === 'available') {
    try {
      await loadTemplateBaseline(workspaceDir, instance.baseline.original)
      const baseline = await loadTemplateBaseline(workspaceDir, instance.baseline.rendered)
      owner.baseline = { status: 'available', detail: 'Both retained source and rendered snapshots passed integrity validation.' }
      try {
        const target = await lstat(await safeInstancePath(workspaceDir, instance.target))
        if (!target.isDirectory()) {
          owner.files.push({ path: instance.target, state: 'modified', detail: 'The instance directory was replaced by a non-directory.' })
        }
      }
      catch (error) {
        owner.files.push({ path: instance.target, state: isMissing(error) ? 'deleted' : 'unavailable', detail: errorDetail(error) })
      }
      const excluded = (filename: string) => instance.excludedPaths?.some(prefix => filename === prefix || filename.startsWith(`${prefix}/`))
      for (const file of baseline.files) {
        const filename = `${instance.target}/${file.path}`
        owner.files.push(excluded(file.path)
          ? { path: filename, state: 'excluded', baselineHash: snapshotFileHash(file), detail: 'Explicitly excluded from template management.' }
          : await compareManagedFile(workspaceDir, filename, snapshotFileHash(file), file.executable))
      }
      for (const relative of baseline.directories) {
        const filename = `${instance.target}/${relative}`
        let result: TemplateDriftFile = { path: filename, state: 'excluded', detail: 'Explicitly excluded from template management.' }
        if (!excluded(relative)) {
          try {
            const stat = await lstat(await safeInstancePath(workspaceDir, filename))
            result = { path: filename, state: stat.isDirectory() ? 'unchanged' : 'modified', ...(stat.isDirectory() ? {} : { detail: 'A retained template directory was replaced.' }) }
          }
          catch (error) {
            result = { path: filename, state: isMissing(error) ? 'deleted' : 'unavailable', detail: errorDetail(error) }
          }
        }
        owner.files.push(result)
      }
    }
    catch (error) {
      owner.baseline = { status: 'unavailable', detail: errorDetail(error) }
    }
  }
  for (const relative of instance.excludedPaths ?? []) {
    const filename = `${instance.target}/${relative}`
    if (!owner.files.some(file => file.path === filename)) {
      owner.files.push({ path: filename, state: 'excluded', detail: 'Explicitly excluded from template management.' })
    }
  }
  owner.local = localDriftState(owner.files, owner.baseline.status)
  if (owner.version.status === 'newer') {
    owner.recommendations.push(`Preview templates upgrade ${instance.id} --source-version ${evidence.version} before applying changes.`)
  }
  if (owner.local === 'drifted') {
    owner.recommendations.push('Review local modifications and deletions; preserve business changes or explicitly exclude owned paths during an instance upgrade.')
  }
  if (owner.baseline.status !== 'available') {
    owner.recommendations.push('Restore retained metadata, or link the instance to its verified exact historical source. Do not treat current files as a historical baseline.')
  }
  if (owner.local === 'unknown' && owner.baseline.status === 'available') {
    owner.recommendations.push('Resolve unavailable managed paths and rerun the read-only check.')
  }
  return owner
}

export async function collectInstanceDrift(workspaceDir: string, evidence: TemplateVersionEvidence) {
  let registry: TemplateDriftRegistry = { path: templateRegistryPath, status: 'available', detail: 'Registered template instances were loaded.' }
  try {
    try {
      await lstat(await safeInstancePath(workspaceDir, templateRegistryPath))
    }
    catch (error) {
      if (!isMissing(error)) {
        throw error
      }
      registry = { ...registry, status: 'absent', detail: 'No template instances are registered; unmanaged projects were not inspected.' }
    }
    const record = await loadTemplateInstanceRegistry(workspaceDir)
    const owners: TemplateDriftOwner[] = []
    for (const instance of record.instances) {
      owners.push(await inspectInstance(workspaceDir, instance, evidence))
    }
    return { registry, owners }
  }
  catch (error) {
    return { registry: { ...registry, status: 'unavailable' as const, detail: errorDetail(error) }, owners: [] }
  }
}
