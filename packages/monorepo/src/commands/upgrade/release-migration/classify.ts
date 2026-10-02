import path from 'pathe'
import fs from '../../../utils/fs'

export const releaseWorkflowMarker = '# repoctl-managed: release/v2'

export type ReleaseWorkflowStatus = 'missing' | 'managed' | 'legacy' | 'custom'

export function isLegacyReleaseWorkflow(content: string) {
  if (!content.includes('changesets/action')) {
    return false
  }

  // The official workflow has used both changesets/action's publish-script
  // input and an explicit `changeset publish` shell command over time.
  return content.includes('publish-script:')
    || content.includes('changeset publish')
    || content.includes('changeset version')
    || content.includes('pnpm exec repo release')
}

export async function classifyReleaseWorkflow(workspaceDir: string): Promise<ReleaseWorkflowStatus> {
  const workflowPath = path.join(workspaceDir, '.github/workflows/release.yml')
  if (!await fs.pathExists(workflowPath)) {
    return 'missing'
  }
  const content = await fs.readFile(workflowPath, 'utf8')
  if (content.includes(releaseWorkflowMarker)) {
    return 'managed'
  }
  if (isLegacyReleaseWorkflow(content)) {
    return 'legacy'
  }
  return 'custom'
}
