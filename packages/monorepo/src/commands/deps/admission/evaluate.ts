import type { AdmissionInput } from './scan'
import type { AdmissionDeclaration, DependencyAdmissionConfig, DependencyAdmissionFinding, DependencyAdmissionReport } from './types'
import { admissionFindingKey } from './baseline'
import { matchesDependency, matchesWorkspace } from './scan'

export function evaluateAdmission(inputs: AdmissionInput[], nodes: Parameters<typeof matchesWorkspace>[1][], config: DependencyAdmissionConfig, report: DependencyAdmissionReport, now: Date) {
  const add = (finding: Omit<DependencyAdmissionFinding, 'key' | 'baseline'>) => {
    const key = admissionFindingKey(finding)
    if (!report.findings.some(item => item.key === key)) {
      report.findings.push({ ...finding, key, baseline: 'new' })
    }
  }
  const today = now.toISOString().slice(0, 10)
  const used = new Set<number>()
  const waiverResults = new Map<number, boolean>()
  function waive(rule: string, declaration: AdmissionDeclaration) {
    const index = config.exceptions?.findIndex(item => item.rule === rule && item.workspace === declaration.workspace && item.section === declaration.section && item.dependency === declaration.name) ?? -1
    if (index < 0) {
      return false
    }
    if (waiverResults.has(index)) {
      return waiverResults.get(index)!
    }
    used.add(index)
    const exception = config.exceptions![index]!
    if (exception.expiresOn && exception.expiresOn < today) {
      add({ id: 'admission-expired-exception', status: 'warn', rule, declaration, reason: exception.reason, detail: `Exception expired after ${exception.expiresOn} UTC and does not waive this violation.` })
      waiverResults.set(index, false)
      return false
    }
    waiverResults.set(index, true)
    report.exceptions.push({ ...exception, declaration })
    if (exception.expiresOn && Date.parse(exception.expiresOn) - Date.parse(today) <= 7 * 86400000) {
      add({ id: 'admission-expiring-exception', status: 'warn', rule, declaration, reason: exception.reason, detail: `Exception is valid through ${exception.expiresOn} UTC and expires within seven days.` })
    }
    return true
  }
  const scopes = new Map(config.rules.map(rule => [rule.id, new Set(nodes.filter(node => rule.workspaces.some(selector => matchesWorkspace(selector, node))).map(node => node.id))]))
  for (const rule of config.rules) {
    for (const selector of rule.workspaces) {
      if (!nodes.some(node => matchesWorkspace(selector, node))) {
        add({ id: 'admission-selector-unmatched', status: 'warn', rule: rule.id, detail: `No workspace matches selector ${selector}.` })
      }
    }
  }
  for (const { declaration, problem } of inputs) {
    const rules = config.rules.filter(rule => scopes.get(rule.id)!.has(declaration.workspace) && rule.sections.includes(declaration.section))
    if (!rules.length) {
      continue
    }
    if (problem) {
      add({ id: 'admission-resolution', status: 'fail', rule: '', declaration, detail: problem })
      continue
    }
    const matchesTarget = (patterns: string[]) => patterns.some(pattern => matchesDependency(pattern, declaration.target!))
    const allows = rules.filter(rule => rule.effect === 'allow')
    const permitting = allows.filter(rule => matchesTarget(rule.dependencies))
    const denying = rules.filter(rule => rule.effect === 'deny' && rule.dependencies.some(pattern => matchesDependency(pattern, declaration.name) || matchesDependency(pattern, declaration.target!)))
    if (permitting.length && denying.length) {
      add({ id: 'admission-conflict', status: 'fail', rule: [...permitting, ...denying].map(rule => rule.id).sort().join(', '), declaration, detail: 'The same declaration is explicitly allowed and denied. Resolve the conflicting scopes; rule order and exceptions cannot choose a winner.' })
      continue
    }
    const missingAllowance = allows.length > 0 && !permitting.length && !allows.some(rule => waive(rule.id, declaration))
    const violated = [...denying, ...(missingAllowance ? allows : [])]
    for (const rule of violated) {
      if (waive(rule.id, declaration)) {
        continue
      }
      add({ id: rule.effect === 'deny' ? 'admission-denied' : 'admission-not-allowed', status: rule.severity ?? 'fail', rule: rule.id, declaration, detail: rule.effect === 'deny' ? 'A deny rule matches the declaration or its npm alias target.' : 'The actual dependency target is outside the workspace allowlist.', reason: rule.reason, ...(rule.alternative ? { alternative: rule.alternative } : {}) })
    }
  }
  config.exceptions?.forEach((exception, index) => {
    if (!used.has(index)) {
      add({ id: 'admission-unused-exception', status: 'warn', rule: exception.rule, detail: `Unused exception for ${exception.workspace} ${exception.section}.${exception.dependency}; ${exception.reason}` })
    }
  })
}
