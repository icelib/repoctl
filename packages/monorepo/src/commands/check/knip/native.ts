import type { KnipFinding } from '../../../types/knip'
import path from 'pathe'
import { hash, record } from '../../deps/files'

const marker = '__REPOCTL_KNIP_REPORT_V1__'

export function findingFingerprint(finding: Omit<KnipFinding, 'fingerprint'>) {
  const members = Array.isArray(finding.native['symbols'])
    ? finding.native['symbols'].map(member => [member.symbol, member.kind ?? '', member.specifier ?? '']).sort()
    : []
  return hash(JSON.stringify([finding.type, finding.severity, finding.workspace, finding.file, finding.symbol, finding.native['parentSymbol'] ?? '', finding.native['specifier'] ?? '', members]))
}

export function normalizeFinding(root: string, workspaces: string[], value: unknown): KnipFinding {
  const issue = record(value)
  if (!issue || typeof issue['type'] !== 'string' || !issue['type'] || !['warn', 'error'].includes(String(issue['severity']))
    || typeof issue['filePath'] !== 'string' || typeof issue['symbol'] !== 'string' || typeof issue['workspace'] !== 'string') {
    throw new Error('Knip returned an unsupported diagnostic shape.')
  }
  for (const key of ['line', 'col', 'pos']) {
    if (issue[key] !== undefined && (!Number.isSafeInteger(issue[key]) || Number(issue[key]) < 0)) {
      throw new Error('Knip returned an invalid source location.')
    }
  }
  if (issue['symbols'] !== undefined && (!Array.isArray(issue['symbols']) || issue['symbols'].some(item => !record(item) || typeof item.symbol !== 'string'))) {
    throw new Error('Knip returned invalid diagnostic members.')
  }
  const file = path.relative(root, path.resolve(root, issue['filePath'])) || '.'
  const nativeWorkspace = path.isAbsolute(issue['workspace']) ? path.relative(root, issue['workspace']) || '.' : issue['workspace']
  const workspace = workspaces.includes(nativeWorkspace)
    ? nativeWorkspace
    : [...workspaces].sort((a, b) => b.length - a.length).find(dir => dir === '.' || file === dir || file.startsWith(`${dir}/`)) ?? '.'
  const hint = record(issue['hint'])
  const native = {
    ...issue,
    filePath: file,
    workspace: nativeWorkspace,
    ...(hint && typeof hint['filePath'] === 'string' ? { hint: { ...hint, filePath: path.relative(root, path.resolve(root, hint['filePath'])) || '.' } } : {}),
  }
  const finding = {
    type: issue['type'],
    severity: issue['severity'] as 'warn' | 'error',
    workspace,
    file,
    symbol: issue['symbol'],
    ...(typeof issue['line'] === 'number' ? { line: issue['line'] } : {}),
    ...(typeof issue['col'] === 'number' ? { column: issue['col'] } : {}),
    native,
  }
  return { fingerprint: findingFingerprint(finding), ...finding }
}

export function parseKnipOutput(root: string, stdout: string) {
  const lines = stdout.split(/\r?\n/)
  const reports = lines.filter(line => line.startsWith(marker))
  if (reports.length !== 1) {
    throw new Error('Knip did not emit exactly one complete repoctl reporter payload.')
  }
  const native = record(JSON.parse(reports[0]!.slice(marker.length)))
  const report = record(native?.['report'])
  const nativePlugins = record(native?.['plugins'])
  if (!native || native['schemaVersion'] !== 1 || native['kind'] !== 'repoctl-knip-native'
    || typeof native['cwd'] !== 'string' || path.resolve(native['cwd']) !== root
    || typeof native['hasConfigLoadErrors'] !== 'boolean' || !Array.isArray(native['findings'])
    || !Array.isArray(native['workspaces']) || native['workspaces'].some(item => typeof item !== 'string')
    || !report || Object.values(report).some(item => typeof item !== 'boolean')
    || !nativePlugins || Object.values(nativePlugins).some(item => !Array.isArray(item) || item.some(name => typeof name !== 'string'))
    || (native['configFilePath'] !== null && typeof native['configFilePath'] !== 'string')) {
    throw new Error('Knip returned an incompatible reporter payload.')
  }
  if (native['hasConfigLoadErrors']) {
    throw new Error('Knip could not load all tool configurations; this analysis is incomplete.')
  }
  const workspaces = [...new Set(native['workspaces'].map(item => path.relative(root, path.resolve(root, item)) || '.'))].sort()
  if (!workspaces.length) {
    throw new Error('Knip reported no analyzed workspaces.')
  }
  const findings = native['findings'].map(item => normalizeFinding(root, workspaces, item)).sort((a, b) => a.fingerprint.localeCompare(b.fingerprint))
  if (new Set(findings.map(item => item.fingerprint)).size !== findings.length) {
    throw new Error('Knip returned duplicate diagnostic identities.')
  }
  const plugins = Object.fromEntries(Object.entries(nativePlugins).map(([key, values]) => [path.isAbsolute(key) ? path.relative(root, key) || '.' : key, [...values as string[]].sort()]).sort(([a], [b]) => String(a).localeCompare(String(b))))
  return {
    findings,
    workspaces,
    report: report as Record<string, boolean>,
    plugins,
    configFile: native['configFilePath'] === null ? null : path.relative(root, native['configFilePath'] as string),
    output: lines.filter(line => !line.startsWith(marker)).join('\n').trim(),
  }
}

export function summarizeKnip(findings: KnipFinding[]) {
  const summary = { errors: 0, warnings: 0, byType: {} as Record<string, { errors: number, warnings: number }> }
  for (const finding of findings) {
    const counts = summary.byType[finding.type] ??= { errors: 0, warnings: 0 }
    const key = finding.severity === 'error' ? 'errors' : 'warnings'
    counts[key]++
    summary[key]++
  }
  return summary
}
