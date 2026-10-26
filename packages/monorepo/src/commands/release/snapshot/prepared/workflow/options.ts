import { valid } from 'semver'

export interface SnapshotWorkflowOptions {
  /** Trusted pnpm pin matching the consumer workspace packageManager; defaults to 12.14.0. */
  pnpmVersion?: string
  /** Protected environment whose reviewers approve the frozen candidate. */
  environment?: string
  /** Repository-relative builder filename under .github/workflows. */
  builderWorkflowPath?: string
  /** Repository-relative publisher filename used by npm Trusted Publisher. */
  publisherWorkflowPath?: string
  /** Display name matched by the publisher's workflow_run trigger. */
  builderWorkflowName?: string
  publisherWorkflowName?: string
}

export const snapshotWorkflowDefaults: Required<SnapshotWorkflowOptions> = {
  pnpmVersion: '12.14.0',
  environment: 'pr-snapshot',
  builderWorkflowPath: '.github/workflows/repoctl-snapshot-build.yml',
  publisherWorkflowPath: '.github/workflows/repoctl-snapshot-publish.yml',
  builderWorkflowName: 'repoctl PR snapshot build',
  publisherWorkflowName: 'repoctl PR snapshot publish',
}

function staticName(value: string, label: string) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > 255
    || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) || value.includes('${{')) {
    throw new Error(`Snapshot ${label} must be a nonempty static name without expressions or control characters.`)
  }
}

export function resolveSnapshotWorkflowOptions(options: SnapshotWorkflowOptions = {}): Required<SnapshotWorkflowOptions> {
  const resolved = { ...snapshotWorkflowDefaults }
  for (const key of Object.keys(resolved) as Array<keyof SnapshotWorkflowOptions>) {
    if (options[key] !== undefined) {
      resolved[key] = options[key]
    }
  }
  const { pnpmVersion, builderWorkflowPath, publisherWorkflowPath, builderWorkflowName, publisherWorkflowName } = resolved
  if (valid(pnpmVersion) !== pnpmVersion || !/^12\./u.test(pnpmVersion)) {
    throw new Error('Snapshot workflows require an exact trusted pnpm 12 version.')
  }
  for (const filename of [builderWorkflowPath, publisherWorkflowPath]) {
    if (!/^\.github\/workflows\/[\w.-]+\.ya?ml$/u.test(filename)) {
      throw new Error('Snapshot workflow paths must name YAML files directly under .github/workflows.')
    }
  }
  staticName(resolved.environment, 'environment')
  staticName(builderWorkflowName, 'builder workflow')
  staticName(publisherWorkflowName, 'publisher workflow')
  if (builderWorkflowPath.toLowerCase() === publisherWorkflowPath.toLowerCase()
    || builderWorkflowName.toLowerCase() === publisherWorkflowName.toLowerCase()) {
    throw new Error('Snapshot builder and publisher require distinct workflow paths and names.')
  }
  return resolved
}
