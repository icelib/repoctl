import type { Document } from 'yaml'
import YAML from 'yaml'
import { removeSourceRepoReleaseToolingBuildStepContent } from '../published'

function resetPublishedNightlyDefaults(document: Document) {
  const steps = document.getIn(['jobs', 'nightly', 'steps'], true)
  if (!YAML.isSeq(steps) || !steps.items.some((step) => {
    const run = YAML.isMap(step) ? step.get('run') : undefined
    return typeof run === 'string' && run.includes('pnpm exec repo release nightly')
  })) {
    return false
  }
  const cron = document.getIn(['jobs', 'nightly', 'env', 'REPOCTL_NIGHTLY_SCHEDULE'])
  const provider = document.getIn(['jobs', 'nightly', 'env', 'REPOCTL_NIGHTLY_PROVIDER'])
  const manual = '$' + '{{ github.event_name == \'workflow_dispatch\' && inputs.mode == \'nightly\' }}'
  if (typeof cron !== 'string' || !['npm', 'pkg-pr-new'].includes(String(provider))) {
    return false
  }
  if (!cron && provider === 'npm' && document.getIn(['jobs', 'nightly', 'if']) === manual) {
    return false
  }
  const schedule = document.getIn(['on', 'schedule'], true)
  if (YAML.isSeq(schedule)) {
    for (let index = schedule.items.length - 1; index >= 0; index--) {
      const item = schedule.items[index]
      if (YAML.isMap(item) && item.get('cron') === cron) {
        schedule.delete(index)
      }
    }
    if (!schedule.items.length) {
      document.deleteIn(['on', 'schedule'])
    }
  }
  document.setIn(['jobs', 'nightly', 'env', 'REPOCTL_NIGHTLY_PROVIDER'], 'npm')
  document.setIn(['jobs', 'nightly', 'env', 'REPOCTL_NIGHTLY_SCHEDULE'], '')
  document.setIn(['jobs', 'nightly', 'permissions'], { 'contents': 'read', 'id-token': 'write' })
  document.setIn(['jobs', 'nightly', 'if'], manual)
  return true
}

function pinPublishedBootstrapTool(document: Document, version: string | undefined) {
  if (version === undefined) {
    return false
  }
  if (!/^\d+\.\d+\.\d+(?:-[\dA-Z.-]+)?$/i.test(version)) {
    throw new Error('Cannot publish bootstrap workflows without an exact repoctl version.')
  }
  let changed = false
  for (const name of ['bootstrap-publish', 'bootstrap-verify']) {
    const steps = document.getIn(['jobs', name, 'steps'], true)
    if (!YAML.isSeq(steps) || !steps.items.some(step => YAML.isMap(step) && step.get('id') === 'bootstrap-tool')) {
      continue
    }
    const field = ['jobs', name, 'env', 'REPOCTL_BOOTSTRAP_TOOL_VERSION']
    if (document.getIn(field) !== version) {
      document.setIn(field, version)
      changed = true
    }
  }
  return changed
}

/** Keep source approval and cron configuration out of the shared release workflow. */
export function sanitizePublishedReleaseWorkflowContent(content: string, repoctlVersion?: string) {
  const cleaned = removeSourceRepoReleaseToolingBuildStepContent(content)
  const document = YAML.parseDocument(cleaned)
  if (document.errors.length) {
    throw new Error('Cannot publish an invalid release workflow.')
  }
  let changed = resetPublishedNightlyDefaults(document)
  changed = pinPublishedBootstrapTool(document, repoctlVersion) || changed
  const permissions = document.get('permissions', true)
  if (YAML.isMap(permissions) && permissions.has('actions')) {
    permissions.delete('actions')
    changed = true
  }
  const jobs = document.get('jobs', true)
  if (YAML.isMap(jobs)) {
    for (const { value: job } of jobs.items) {
      if (!YAML.isMap(job)) {
        continue
      }
      const steps = job.get('steps', true)
      if (!YAML.isSeq(steps)) {
        continue
      }
      for (let index = steps.items.length - 1; index >= 0; index--) {
        const step = steps.items[index]
        if (YAML.isMap(step) && step.get('id') === 'pr-ci-approval') {
          steps.delete(index)
          changed = true
        }
      }
    }
  }
  return changed ? document.toString({ lineWidth: 0 }) : cleaned
}
