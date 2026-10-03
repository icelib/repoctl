import type { ReleaseBranchesConfig } from './types'
import YAML from 'yaml'
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
