import type { ReleaseCommandConfig } from '../../../types/release'
import type { ReleaseBranchesConfig } from './types'
import YAML from 'yaml'
import { resolveNightlyConfig } from '../../../core/nightly/config'
import { resolveReleaseBranches } from './config'

/** Called only while planning an explicitly managed workflow; custom workflows stay protected. */
export function renderReleaseBranchesWorkflow(content: string, config?: ReleaseBranchesConfig): string {
  if (config === undefined) {
    return content
  }
  const rules = resolveReleaseBranches(config)
  const document = YAML.parseDocument(content)
  if (document.errors.length) {
    throw new Error('Managed release workflow is invalid YAML')
  }
  document.setIn(['on', 'push', 'branches'], rules.map(rule => rule.branch))
  document.setIn(['on', 'workflow_dispatch', 'inputs', 'source-sha', 'description'], 'Original commit on the selected release line (publish modes only)')
  return document.toString({ lineWidth: 0 })
}

export function nightlyWorkflowCondition(schedule?: string): string {
  const manual = 'github.event_name == \'workflow_dispatch\' && inputs.mode == \'nightly\''
  const condition = schedule ? `(github.event_name == 'schedule' && github.event.schedule == '${schedule}') || (${manual})` : manual
  return '$' + `{{ ${condition} }}`
}

/** Render only the managed nightly route; other scheduled jobs retain their triggers. */
export function renderReleaseWorkflow(content: string, config?: ReleaseCommandConfig): string {
  const document = YAML.parseDocument(renderReleaseBranchesWorkflow(content, config?.branches))
  if (document.errors.length) {
    throw new Error('Managed release workflow is invalid YAML')
  }
  if (!document.hasIn(['jobs', 'nightly'])) {
    return document.toString({ lineWidth: 0 })
  }
  const nightly = resolveNightlyConfig(config?.nightly)
  const previous = document.getIn(['jobs', 'nightly', 'env', 'REPOCTL_NIGHTLY_SCHEDULE'])
  const schedules = document.getIn(['on', 'schedule'], true)
  if (YAML.isSeq(schedules) && typeof previous === 'string' && previous) {
    for (let index = schedules.items.length - 1; index >= 0; index--) {
      const item = schedules.items[index]
      if (YAML.isMap(item) && item.get('cron') === previous) {
        schedules.delete(index)
      }
    }
    if (!schedules.items.length) {
      document.deleteIn(['on', 'schedule'])
    }
  }
  if (nightly.schedule) {
    const remaining = document.getIn(['on', 'schedule'], true)
    if (!YAML.isSeq(remaining) || !remaining.items.some(item => YAML.isMap(item) && item.get('cron') === nightly.schedule)) {
      if (YAML.isSeq(remaining)) {
        remaining.add({ cron: nightly.schedule })
      }
      else {
        document.setIn(['on', 'schedule'], [{ cron: nightly.schedule }])
      }
    }
  }
  document.setIn(['jobs', 'nightly', 'if'], nightlyWorkflowCondition(nightly.schedule))
  document.setIn(['jobs', 'nightly', 'env', 'REPOCTL_NIGHTLY_PROVIDER'], nightly.provider)
  document.setIn(['jobs', 'nightly', 'env', 'REPOCTL_NIGHTLY_SCHEDULE'], nightly.schedule ?? '')
  document.setIn(['jobs', 'nightly', 'permissions'], nightly.provider === 'npm' ? { 'contents': 'read', 'id-token': 'write' } : { contents: 'read' })
  return document.toString({ lineWidth: 0 })
}
