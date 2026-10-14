import YAML from 'yaml'
import { removeSourceRepoReleaseToolingBuildStepContent } from '../published'

/** Keep source-repository PR dispatching out of the shared consumer release flow. */
export function sanitizePublishedReleaseWorkflowContent(content: string) {
  const cleaned = removeSourceRepoReleaseToolingBuildStepContent(content)
  const document = YAML.parseDocument(cleaned)
  if (document.errors.length) {
    throw new Error('Cannot publish an invalid release workflow.')
  }
  let changed = false
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
