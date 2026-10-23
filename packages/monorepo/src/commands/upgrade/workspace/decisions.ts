import type { UpgradeKeepDecision, UpgradeOverrideFinding, UpgradePlan } from '../../../types/upgrade'
import { Buffer } from 'node:buffer'
import { isUpgradeExpiry } from '../../../core/config/validation/upgrade'
import { hash } from '../plan/files'

/** Override values are strings. Include presence so absence and YAML null differ. */
export function overrideFingerprint(values: Record<string, unknown>, selector: string) {
  return hash(Buffer.from(JSON.stringify(Object.hasOwn(values, selector) ? { present: true, value: values[selector] } : { present: false })))
}

export function keepDecisions(decisions: UpgradeKeepDecision[]) {
  const result = new Map<string, UpgradeKeepDecision>()
  for (const decision of decisions) {
    const selector = decision.path[1]
    if (result.has(selector)) {
      throw new Error(`Duplicate upgrade keep decision: overrides[${JSON.stringify(selector)}].`)
    }
    result.set(selector, decision)
  }
  return result
}

export function applyKeepDecision(finding: UpgradeOverrideFinding, decision: UpgradeKeepDecision, today: string) {
  if (decision.expires && decision.expires < today) {
    finding.status = 'expired-decision'
    finding.detail = `Keep decision expired on ${decision.expires}; review again. ${decision.reason}`
  }
  else if (decision.upstreamHash !== finding.upstreamHash || decision.localHash !== finding.localHash) {
    finding.status = 'stale-decision'
    finding.detail = `The upstream or local override changed; review again. ${decision.reason}`
  }
  else {
    finding.status = 'kept'
    finding.detail = decision.reason
  }
}

/** A saved plan cannot outlive the review decision even when files are unchanged. */
export function validateWorkspacePolicyExpiry(plan: UpgradePlan) {
  const today = new Date().toISOString().slice(0, 10)
  for (const file of plan.files) {
    const expires = file.workspacePolicy?.expires
    if (expires !== undefined && (!isUpgradeExpiry(expires) || expires < today)) {
      throw new Error(`Upgrade keep decision expired or invalid for ${file.path}; regenerate the plan.`)
    }
  }
}
