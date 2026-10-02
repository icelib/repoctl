import path from 'pathe'
import YAML from 'yaml'
import fs from '../../../utils/fs'

export const releaseWorkflowMarker = '# repoctl-managed: release/v2'

/**
 * Treat the marker as an explicit opt-in only when it occupies its own YAML
 * comment line.  A substring in a command, quoted value, or unrelated
 * comment must not make a custom workflow look managed.
 */
export function hasReleaseWorkflowMarker(content: string) {
  return content.split(/\r?\n/u).some(line => line.replace(/^\uFEFF/u, '') === releaseWorkflowMarker)
}

export type ReleaseWorkflowStatus = 'missing' | 'managed' | 'legacy' | 'custom'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isChangesetsAction(value: unknown) {
  return typeof value === 'string' && /^changesets\/action(?:@|\s|$)/u.test(value.trim())
}

function isLegacyReleaseCommand(value: unknown) {
  if (typeof value !== 'string') {
    return false
  }
  // A block scalar can contain a small shell script. Inspect each command
  // line, while keeping the match anchored so `echo "pnpm changeset publish"`
  // in a custom workflow does not look like a real release command.
  return value.split(/\r?\n/u).some((line) => {
    const command = line.trim()
    return /^(?:pnpm\s+(?:exec\s+)?)?changeset\s+(?:publish|version)\b/u.test(command)
      || /^pnpm\s+exec\s+repo\s+release\b/u.test(command)
  })
}

function hasLegacyReleaseSignal(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasLegacyReleaseSignal)
  }
  if (!isRecord(value)) {
    return false
  }
  for (const [key, candidate] of Object.entries(value)) {
    if (key === 'publish-script') {
      return isLegacyReleaseCommand(candidate)
    }
    if ((key === 'run' || key === 'publish' || key === 'version') && isLegacyReleaseCommand(candidate)) {
      return true
    }
    if (hasLegacyReleaseSignal(candidate)) {
      return true
    }
  }
  return false
}

function hasLegacyReleaseWorkflowShape(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasLegacyReleaseWorkflowShape)
  }
  if (!isRecord(value)) {
    return false
  }
  if (isChangesetsAction(value['uses'])) {
    return hasLegacyReleaseSignal(value)
  }
  return Object.values(value).some(hasLegacyReleaseWorkflowShape)
}

function containsChangesetsAction(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsChangesetsAction)
  }
  if (!isRecord(value)) {
    return false
  }
  return isChangesetsAction(value['uses']) || Object.values(value).some(containsChangesetsAction)
}

export function isLegacyReleaseWorkflow(content: string) {
  const usesChangesetsAction = /^\s*(?:-\s*)?uses:\s*["']?changesets\/action(?:[@\s"']|$)/mu.test(content)

  // Parse valid YAML so quoted values, inline `with` mappings, and block
  // scalar `run` steps are recognized according to their actual structure.
  // Keep the line-oriented fallback below for partially written workflows;
  // classification must remain safe while a user is editing a file.
  try {
    const parsed = YAML.parse(content)
    if (hasLegacyReleaseWorkflowShape(parsed)
      || (containsChangesetsAction(parsed) && hasLegacyReleaseSignal(parsed))) {
      return true
    }
  }
  catch {
    // Fall through to the conservative structural matcher below.
  }

  if (!usesChangesetsAction) {
    return false
  }

  // The official workflow has used both changesets/action's publish-script
  // input and an explicit `changeset publish` shell command over time. YAML
  // permits sequence entries (`- run:`) and action inputs (`publish:`), so
  // include those structural prefixes while keeping the match anchored to a
  // complete command line. This avoids treating comments or `echo` strings as
  // evidence of a legacy workflow.
  const publishScript = content
    .split(/\r?\n/u)
    .map(line => line.trim().replace(/^-\s*/u, ''))
    .find(line => line.startsWith('publish-script:'))
    ?.slice('publish-script:'.length)
    .trim()
  return (publishScript !== undefined && isLegacyReleaseCommand(publishScript))
    || /^\s*(?:-\s*)?(?:run|publish|version):\s*(?:pnpm\s+(?:exec\s+)?)?changeset\s+(?:publish|version)\b/mu.test(content)
    || /^\s*(?:-\s*)?(?:run|publish|version):\s*pnpm\s+exec\s+repo\s+release\b/mu.test(content)
}

export async function classifyReleaseWorkflow(workspaceDir: string): Promise<ReleaseWorkflowStatus> {
  const workflowPath = path.join(workspaceDir, '.github/workflows/release.yml')
  if (!await fs.pathExists(workflowPath)) {
    return 'missing'
  }
  const content = await fs.readFile(workflowPath, 'utf8')
  if (hasReleaseWorkflowMarker(content)) {
    return 'managed'
  }
  if (isLegacyReleaseWorkflow(content)) {
    return 'legacy'
  }
  return 'custom'
}
