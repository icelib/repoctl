import type { DoctorCheck, DoctorContext } from '../types'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import YAML from 'yaml'
import { resolveCommandConfig } from '../../../core/config'
import { resolveNightlyConfig } from '../../../core/nightly/config'
import { nightlyWorkflowCondition } from '../../release/lines/workflow'

export const nightlyDoctorIds = ['nightly-workflow', 'nightly-provider', 'nightly-schedule', 'nightly-cli'] as const

interface Workflow { on?: { schedule?: { cron?: string }[], workflow_dispatch?: { inputs?: { mode?: { options?: string[] } } } }, jobs?: { nightly?: { if?: string, permissions?: Record<string, string>, env?: Record<string, string> } } }

export async function collectNightlyChecks(context: DoctorContext, selected: ReadonlySet<string>): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = []
  const fix = 'Review pnpm exec repo upgrade --json, then apply the reviewed plan. Custom and preset-owned workflows retain their ownership.'
  const add = (id: typeof nightlyDoctorIds[number], status: DoctorCheck['status'], detail: string, suggestion = fix) => {
    if (selected.has(id)) {
      checks.push({ id, title: id.replaceAll('-', ' '), status, detail, ...(status === 'pass' ? {} : { fix: suggestion }) })
    }
  }
  let config
  try {
    config = await resolveCommandConfig('release', context.workspaceDir)
  }
  catch {
    add('nightly-workflow', 'fail', 'Unable to load release configuration.', 'Check repoctl configuration with repo config check.')
    return checks
  }
  let document: Workflow | undefined
  try {
    const parsed = YAML.parseDocument(await readFile(path.join(context.workspaceDir, '.github/workflows/release.yml'), 'utf8'))
    if (parsed.errors.length) {
      throw new Error('Invalid release YAML')
    }
    document = parsed.toJS() as Workflow
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || config?.nightly) {
      add('nightly-workflow', 'warn', 'Nightly configuration requires a valid Release workflow.')
    }
    return checks
  }
  const job = document?.jobs?.nightly
  if (!job && !config?.nightly) {
    return checks
  }
  const nightly = resolveNightlyConfig(config?.nightly)
  const modes = document?.on?.workflow_dispatch?.inputs?.mode?.options
  add('nightly-workflow', job && modes?.includes('nightly') ? 'pass' : 'warn', job && modes?.includes('nightly') ? 'The Release workflow provides the nightly manual entrypoint.' : 'The Release workflow is missing the nightly job or manual option.')
  if (job) {
    const expectedPermissions = nightly.provider === 'npm' ? { 'contents': 'read', 'id-token': 'write' } : { contents: 'read' }
    const permissions = job.permissions ?? {}
    const matches = job.env?.['REPOCTL_NIGHTLY_PROVIDER'] === nightly.provider
      && Object.keys(permissions).length === Object.keys(expectedPermissions).length
      && Object.entries(expectedPermissions).every(([key, value]) => permissions[key] === value)
    add('nightly-provider', matches ? 'pass' : 'warn', matches ? `Nightly workflow permissions match ${nightly.provider}.` : `Nightly workflow provider or permissions differ from configured ${nightly.provider}.`)
    const marker = job.env?.['REPOCTL_NIGHTLY_SCHEDULE']
    const schedules = document?.on?.schedule ?? []
    const hasSchedule = !nightly.schedule || schedules.some(item => item.cron === nightly.schedule)
    const routes = job.if === nightlyWorkflowCondition(nightly.schedule)
    const matchesSchedule = marker === (nightly.schedule ?? '') && hasSchedule && routes
    add('nightly-schedule', matchesSchedule ? 'pass' : 'warn', matchesSchedule ? nightly.schedule ? `Nightly runs on UTC cron ${nightly.schedule}.` : 'Nightly is manual only.' : 'Nightly schedule configuration has not been synchronized with its trigger and routing.')
  }
  if (selected.has('nightly-cli')) {
    let capable = context.isSourceWorkspace
    if (!capable) {
      try {
        const installed = JSON.parse(await readFile(path.join(context.workspaceDir, 'node_modules/repoctl/package.json'), 'utf8')) as { name?: string }
        if (installed.name !== 'repoctl') {
          throw new Error('The workspace does not have repoctl installed.')
        }
        const require = createRequire(path.join(context.workspaceDir, 'package.json'))
        const api = await import(pathToFileURL(require.resolve('repoctl')).href) as Record<string, unknown>
        capable = typeof api['createNightlyPlan'] === 'function' && typeof api['releaseNightly'] === 'function'
      }
      catch {
        capable = false
      }
    }
    add('nightly-cli', capable ? 'pass' : 'warn', capable ? 'Installed repoctl supports the nightly workflow.' : 'Installed repoctl is missing the nightly APIs or dependencies are not installed.', 'Upgrade repoctl and install the updated lockfile before using the nightly workflow.')
  }
  return checks
}
