import type { DocsDeploymentStageKey } from '../types'
import { DocsDiagnosticError, docsDiagnosticMessage } from '../diagnostics'
import { DocsReadinessError } from '../readiness'

export const stageOrder: DocsDeploymentStageKey[] = ['plan', 'preflight', 'install', 'build', 'provider', 'readiness', 'finalize']
const skipReasons = new Set(['not-required', 'already-completed', 'resumed-verification', 'not-run'])
const readinessReasons = new Set(['identity-mismatch', 'invalid-payload', 'invalid-json', 'response-too-large', 'http-status', 'network-error', 'request-timeout'])

export function safeSkipReason(reason: string) {
  return skipReasons.has(reason) ? reason : 'not-run'
}

export function safeFailureReason(error: unknown, stage: DocsDeploymentStageKey) {
  if (error instanceof DocsDiagnosticError && docsDiagnosticMessage(error.reason)) {
    return error.reason
  }
  if (error instanceof DocsReadinessError && readinessReasons.has(error.reason)) {
    return error.reason
  }
  return `${stage}-failed`
}

export function safeFailureMessage(reason: string) {
  return docsDiagnosticMessage(reason)
}

/** Defense in depth for public IDs; never inspect or serialize a caught error's data. */
export function identityRedactor(env: NodeJS.ProcessEnv) {
  const secrets = Object.entries(env).flatMap(([key, value]) => /TOKEN|SECRET|PASSWORD|API_KEY|AUTHORIZATION|COOKIE/i.test(key) && value && value.length >= 4 ? [value] : [])
  return (value: string) => {
    if (secrets.some(secret => value.includes(secret))) {
      return '[redacted]'
    }
    return /^[a-z\d][\w.:-]{0,255}$/i.test(value) ? value : '[unavailable]'
  }
}

export function duration(start: number, end: number) {
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round(end - start)) : 0
}
