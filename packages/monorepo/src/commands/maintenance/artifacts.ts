import type { MaintenanceFile, MaintenanceUpgradeOptions, MaintenanceUpgradeReport } from './types'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { upgradeOperations } from '../upgrade/baseline/apply'
import { digest, maintenanceGit, maintenanceGitBytes } from './process'

function entries(text: string) {
  return new Map(text.split('\0').filter(Boolean).map((entry) => {
    const [metadata, filename] = entry.split('\t')
    const [mode, object] = metadata!.split(' ')
    return [filename!, { mode: mode!, object: object! }]
  }))
}

export async function createMaintenancePatch(options: MaintenanceUpgradeOptions, report: MaintenanceUpgradeReport) {
  if (maintenanceGit(options.cwd, ['rev-parse', 'HEAD']).trim() !== report.head) {
    throw new Error('Validation changed Git HEAD; no upgrade patch can be published.')
  }
  const operations = upgradeOperations(report.plan!.files)
  const allowed = new Set([...operations.map(file => file.path), 'pnpm-lock.yaml'])
  for (const file of operations) {
    const bytes = await readFile(path.join(options.cwd, file.path)).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return null
      }
      throw error
    })
    if ((bytes === null ? null : digest(bytes)) !== file.afterHash) {
      throw new Error(`Validation changed planned asset bytes: ${file.path}`)
    }
  }
  const changed = [
    ...maintenanceGit(options.cwd, ['diff', '--name-only', '-z', report.head]).split('\0'),
    ...maintenanceGit(options.cwd, ['diff', '--cached', '--name-only', '-z', report.head]).split('\0'),
    ...maintenanceGit(options.cwd, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0'),
  ].filter(Boolean)
  if (changed.some(filename => !allowed.has(filename))) {
    throw new Error(`Validation changed files outside the upgrade plan: ${changed.filter(filename => !allowed.has(filename)).join(', ')}`)
  }
  const env = { ...(options.env ?? process.env), GIT_INDEX_FILE: path.join(options.outputDirectory, 'index') }
  maintenanceGit(options.cwd, ['read-tree', report.head], env)
  if (changed.length) {
    maintenanceGit(options.cwd, ['add', '-A', '--', ...changed], env)
  }
  const names = maintenanceGit(options.cwd, ['diff', '--cached', '--name-only', '-z', report.head], env).split('\0').filter(Boolean)
  const before = entries(maintenanceGit(options.cwd, ['ls-tree', '-r', '-z', report.head]))
  const after = entries(maintenanceGit(options.cwd, ['ls-files', '--stage', '-z'], env))
  const files: MaintenanceFile[] = []
  for (const filename of names) {
    const previous = before.get(filename)
    const next = after.get(filename)
    if (![previous, next].every(entry => !entry || ['100644', '100755'].includes(entry.mode))) {
      throw new Error(`Unsupported Git mode in maintenance patch: ${filename}`)
    }
    files.push({
      path: filename,
      beforeHash: previous ? digest(maintenanceGitBytes(options.cwd, ['show', `${report.head}:${filename}`])) : null,
      afterHash: next ? digest(await readFile(path.join(options.cwd, filename))) : null,
      beforeMode: previous?.mode ?? null,
      afterMode: next?.mode ?? null,
    })
  }
  const patch = maintenanceGit(options.cwd, ['diff', '--cached', '--binary', '--full-index', '--no-renames', report.head], env)
  await writeFile(path.join(options.outputDirectory, 'changes.patch'), patch)
  report.files = files
  report.patchHash = digest(patch)
  report.status = files.length ? 'ready' : 'unchanged'
}

export function maintenanceBody(report: MaintenanceUpgradeReport) {
  const lines = [
    '<!-- repoctl-maintenance:v1 -->',
    `Synchronize managed root assets after repoctl ${report.versions.from ?? 'unknown'} → ${report.versions.to ?? 'unknown'}.`,
    '',
    `Source commit: ${report.head}. Comparison: ${report.base}. Status: ${report.status}.`,
    '',
    'Planned assets:',
    ...(report.plan?.files.map(file => `- ${file.path}: ${file.status} (${file.reason})`) ?? ['- No asset plan was needed.']),
    '',
    'Validation:',
    ...report.checks.map(check => `- ${check.name}: ${check.status}`),
    ...report.errors.map(error => `- Blocked: ${error}`),
    '',
    'The workflow artifact contains the complete plan, exact patch, file hashes, skipped/conflicting entries and validation logs. This PR is never merged automatically.',
  ]
  return `${lines.join('\n')}\n`
}
