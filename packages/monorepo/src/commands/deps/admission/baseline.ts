import type { DependencyAdmissionConfig, DependencyAdmissionFinding } from './types'
import { hash, record } from '../files'

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonical)
  }
  const object = record(value)
  return object ? Object.fromEntries(Object.keys(object).sort().filter(key => object[key] !== undefined).map(key => [key, canonical(object[key])])) : value
}

export const admissionPolicyHash = (policy: DependencyAdmissionConfig) => hash(JSON.stringify(canonical(policy)))

export function admissionFindingKey(finding: Pick<DependencyAdmissionFinding, 'id' | 'rule' | 'declaration' | 'detail'>) {
  const declaration = finding.declaration
  return hash(JSON.stringify([finding.id, finding.rule, ...(declaration
    ? [declaration.workspace, declaration.section, declaration.name, declaration.target]
    : [finding.detail])]))
}

/** The baseline is an explicitly reviewed artifact, not a source of policy or execution. */
export function readAdmissionBaseline(value: unknown, policyHash: string) {
  const baseline = record(value)
  if (!baseline || baseline['schemaVersion'] !== 1 || baseline['kind'] !== 'dependency-admission'
    || baseline['policyHash'] !== policyHash || !Array.isArray(baseline['findings'])) {
    throw new Error('Dependency policy baseline is invalid or was created with a different policy. Review a new baseline or explicitly use --full.')
  }
  const keys = new Set<string>()
  for (const value of baseline['findings']) {
    const finding = record(value)
    if (!finding || typeof finding['id'] !== 'string' || !finding['id'].startsWith('admission-')
      || typeof finding['rule'] !== 'string' || typeof finding['detail'] !== 'string'
      || !['warn', 'fail'].includes(finding['status'] as string)
      || typeof finding['key'] !== 'string') {
      throw new Error('Dependency policy baseline contains an invalid finding.')
    }
    if (finding['declaration'] !== undefined) {
      const declaration = record(finding['declaration'])
      if (!declaration || !['workspace', 'path', 'section', 'name'].every(key => typeof declaration[key] === 'string')
        || (declaration['target'] !== null && typeof declaration['target'] !== 'string')) {
        throw new Error('Dependency policy baseline contains an invalid declaration.')
      }
    }
    if (finding['key'] !== admissionFindingKey(finding as unknown as DependencyAdmissionFinding) || keys.has(finding['key'])) {
      throw new Error('Dependency policy baseline finding keys are inconsistent or duplicated.')
    }
    keys.add(finding['key'])
  }
  return keys
}
