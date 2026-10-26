import type { AutoChangesetWorkflowOptions } from './types'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { packageDir, version } from '../../../constants'
import { safePath, textValue } from './github/client'
import { defaultPolicyPath } from './policy'

export function workflowConfiguration(options: AutoChangesetWorkflowOptions = {}) {
  const configuration = {
    environment: options.environment ?? 'release-intent-write',
    workflowPath: options.workflowPath ?? '.github/workflows/repoctl-auto-changeset.yml',
    workflowName: options.workflowName ?? 'Repoctl automatic changeset',
    planJobName: options.planJobName ?? 'Plan automatic changeset',
    applyJobName: options.applyJobName ?? 'Apply automatic changeset',
    policyPath: options.policyPath ?? defaultPolicyPath,
  }
  for (const value of Object.values(configuration)) {
    textValue(value, 'workflow setting')
    if (value.includes('${{') || value.length > 200) {
      throw new Error('Workflow settings must be bounded literal values, without expressions.')
    }
  }
  safePath(configuration.policyPath)
  if (!/^\.github\/workflows\/[\w.-]+\.ya?ml$/u.test(configuration.workflowPath)
    || configuration.planJobName === configuration.applyJobName) {
    throw new Error('Invalid workflow path or duplicate job names.')
  }
  return configuration
}

export async function getAutoChangesetWorkflow(options: AutoChangesetWorkflowOptions = {}): Promise<string> {
  const configuration = workflowConfiguration(options)
  const template = await readFile(path.join(packageDir, 'resources/release-auto-changeset/workflow.yml'), 'utf8')
  const values: Record<string, string> = {
    __VERSION__: version,
    __ENVIRONMENT__: JSON.stringify(configuration.environment),
    __WORKFLOW_NAME__: JSON.stringify(configuration.workflowName),
    __WORKFLOW_PATH__: JSON.stringify(configuration.workflowPath),
    __PLAN_JOB_NAME__: JSON.stringify(configuration.planJobName),
    __APPLY_JOB_NAME__: JSON.stringify(configuration.applyJobName),
    __POLICY_PATH__: JSON.stringify(configuration.policyPath),
  }
  return template.replace(/__[A-Z_]+__/gu, key => values[key] ?? key)
}
