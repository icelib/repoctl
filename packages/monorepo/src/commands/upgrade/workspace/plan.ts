import type { UpgradeWorkspacePolicy } from '../../../types/upgrade'
import type { UpgradeContext } from '../plan/context'
import type { WorkspaceManifestLike } from './merge'
import path from 'pathe'
import { record } from '../../deps/files'
import { scanDependencies } from '../../deps/scan'
import { applyKeepDecision, keepDecisions } from './decisions'
import { mergeWorkspaceManifest } from './merge'
import { inspectOverride } from './overrides'

export async function planWorkspaceManifest(context: UpgradeContext, upstream: WorkspaceManifestLike, local: WorkspaceManifestLike, deferUnverified = false) {
  const merged = mergeWorkspaceManifest(upstream, local)
  const sourceOverrides = record(upstream['overrides']) ?? {}
  const localOverrides = record(local['overrides']) ?? {}
  const decisions = keepDecisions(context.workspaceDecisions)
  const selectors = [...new Set([...Object.keys(sourceOverrides).filter(key => !Object.hasOwn(localOverrides, key)), ...decisions.keys()])].sort()
  if (!selectors.length) {
    return { manifest: merged }
  }
  // A newly managed workspace must be inspected before its dependencies are overridden.
  const scan = await scanDependencies(context.plan.rootDir, merged.packages ? { patterns: merged.packages } : {})
  if (scan.workspaceDir !== context.plan.rootDir) {
    throw new Error('Upgrade dependency policy must use the destination workspace.')
  }
  for (const [filename, content] of scan.contents) {
    const area = filename === 'pnpm-workspace.yaml' || filename.endsWith('package.json') ? 'target' : 'config'
    const input = await context.read(area, area === 'config' ? path.resolve(scan.workspaceDir, filename) : filename)
    if (input?.toString() !== content) {
      throw new Error(`Dependency policy input changed while planning: ${filename}`)
    }
  }
  context.plan.discovery = {
    patterns: merged.packages ?? null,
    manifests: scan.manifests,
  }
  const policy: UpgradeWorkspacePolicy = { findings: [] }
  const today = new Date().toISOString().slice(0, 10)
  const overrides = { ...record(merged['overrides']) }
  for (const selector of selectors) {
    const finding = inspectOverride(selector, sourceOverrides, localOverrides, scan)
    const decision = decisions.get(selector)
    if (decision) {
      applyKeepDecision(finding, decision, today)
    }
    if (finding.status === 'unverified' && deferUnverified) {
      finding.status = 'deferred'
      finding.detail = 'Preserve the local override during the atomic hook migration. Preview again afterwards to review this unverified override separately.'
    }
    if (finding.status === 'kept' || finding.status === 'deferred') {
      if (Object.hasOwn(localOverrides, selector)) {
        overrides[selector] = localOverrides[selector]
      }
      else {
        delete overrides[selector]
      }
      if (decision?.expires && (!policy.expires || decision.expires < policy.expires)) {
        policy.expires = decision.expires
      }
    }
    policy.findings.push(finding)
  }
  ;(merged as Record<string, unknown>)['overrides'] = overrides
  return { manifest: merged, policy }
}
