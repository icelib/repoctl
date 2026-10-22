import type { PackageJson } from '../../../types'
import type { UpgradeContext } from './context'
import { Buffer } from 'node:buffer'
import { readdir } from 'node:fs/promises'
import path from 'pathe'
import YAML from 'yaml'
import { GitClient } from '../../../core/git'
import { toWorkspaceAssetPath, updateIssueTemplateConfig } from '../../../utils'
import { renderReleaseWorkflow } from '../../release/lines/workflow'
import { migrateLegacyToolingReferences } from '../../tooling-migration'
import { isAgentsMarkdownEquivalent, mergeAgentsMarkdown } from '../agents'
import { createBaselinePlanner } from '../baseline/plan'
import { hookGroup, hookTargets, prepareHooksUpgrade } from '../hooks'
import { removeDefaultHookTooling } from '../hooks/inspect'
import { setPkgJson } from '../pkg-json'
import { isLegacyReleaseWorkflow, releaseWorkflowMarker } from '../release-migration/classify'
import { isTextEquivalent, mergeGitignore } from '../text'
import { mergeWorkspaceManifest, normalizeWorkspaceManifest } from '../workspace'

export async function planAssets(context: UpgradeContext) {
  const { plan, read, put, options, config } = context
  const hooks = await prepareHooksUpgrade(context)
  const baseline = await createBaselinePlanner(context)
  const repoName = await new GitClient({ baseDir: plan.cwd }).getRepoName()
  async function walk(directory: string) {
    for (const item of (await readdir(path.join(plan.assetDir, directory), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const assetPath = directory ? `${directory}/${item.name}` : item.name
      const filename = toWorkspaceAssetPath(assetPath)
      if (!plan.targets.some(target => filename === target || filename.startsWith(`${target}/`) || target.startsWith(`${filename}/`))) {
        continue
      }
      if (item.isDirectory()) {
        await walk(assetPath)
        continue
      }
      try {
        const source = await read('asset', assetPath)
        if (source === null) {
          throw new Error(`Asset disappeared: ${assetPath}`)
        }
        const before = await read('target', filename)
        if (hooks.skipTargets.has(filename)) {
          await put(filename, before, hooks.manual ? 'custom-hooks-protected' : 'hooks-protected', hooks.manual ? 'Preserved legacy Git hooks and dependencies. Migrate custom hooks/configuration to lefthook.yml manually before removing Husky and lint-staged.' : 'Git hooks are preserved as a complete setup.', { skip: true })
          continue
        }
        let after = source
        let upstream = source
        let reason = 'managed-asset'
        let skip = false
        if ((config.skipChangesetMarkdown ?? true) && filename.startsWith('.changeset/') && filename.endsWith('.md')) {
          reason = 'change-intent-protected'
          skip = true
        }
        else if (filename === 'LICENSE' && before !== null) {
          reason = 'license-protected'
          skip = true
        }
        else if (filename === '.github/workflows/repoctl-docs.yml' && !Object.keys(context.docsConfig?.sites ?? {}).length) {
          reason = 'docs-not-configured'
          skip = true
        }
        else if (['.github/workflows/repoctl-docs.yml', '.github/workflows/repoctl-docs-deploy.yml'].includes(filename)
          && before !== null && !before.toString().startsWith('# repoctl-managed: docs')) {
          reason = 'custom-docs-protected'
          skip = true
        }
        else if (filename === '.github/workflows/release.yml' && before !== null && !options.overwriteRelease
          && !before.toString().includes(releaseWorkflowMarker) && !isLegacyReleaseWorkflow(before.toString())) {
          reason = 'custom-release-protected'
          skip = true
        }
        else if (filename === '.github/workflows/release.yml') {
          after = Buffer.from(renderReleaseWorkflow(source.toString(), context.releaseConfig))
          upstream = after
          reason = context.releaseConfig?.nightly ? 'release-nightly-configuration' : context.releaseConfig?.branches ? 'release-branch-mapping' : 'managed-asset'
        }
        else if (filename === 'package.json') {
          if (before === null) {
            reason = 'root-package-required'
            skip = true
          }
          else {
            const target = JSON.parse(before.toString()) as PackageJson
            setPkgJson(JSON.parse(source.toString()) as PackageJson, target, config.scripts ? { scripts: config.scripts } : undefined)
            after = Buffer.from(`${JSON.stringify(target, null, 2)}\n`)
            reason = 'package-semantic-merge'
          }
        }
        else if (filename === 'pnpm-workspace.yaml') {
          const original = normalizeWorkspaceManifest(YAML.parse(source.toString()))
          after = Buffer.from(YAML.stringify(before ? mergeWorkspaceManifest(original, normalizeWorkspaceManifest(YAML.parse(before.toString()))) : original, { singleQuote: true }))
          reason = 'workspace-semantic-merge'
        }
        else if (filename === '.gitignore' && before !== null) {
          after = Buffer.from(mergeGitignore(source.toString(), before.toString()))
          if (isTextEquivalent(before.toString(), after.toString())) {
            after = before
          }
          reason = 'gitignore-semantic-merge'
        }
        else if (filename === 'AGENTS.md' && before !== null) {
          after = Buffer.from(mergeAgentsMarkdown(source.toString(), before.toString()))
          if (isAgentsMarkdownEquivalent(before.toString(), after.toString())) {
            after = before
          }
          reason = 'agents-semantic-merge'
        }
        else if (filename === '.github/ISSUE_TEMPLATE/config.yml') {
          after = Buffer.from(updateIssueTemplateConfig(source.toString(), repoName))
          upstream = after
          reason = 'repository-issue-links'
        }
        else if (filename === 'repoctl.config.ts' && hooks.migrate) {
          after = Buffer.from(removeDefaultHookTooling(hooks.config ?? source.toString()))
          reason = 'hooks-semantic-merge'
        }
        else if (/\.(?:js|mjs|ts|mts|cjs|cts)$/.test(filename)) {
          upstream = Buffer.from(migrateLegacyToolingReferences(source.toString(), 'repoctl/tooling'))
          const original = (before ?? source).toString()
          const migrated = migrateLegacyToolingReferences(original, 'repoctl/tooling')
          after = Buffer.from(migrated === original ? migrateLegacyToolingReferences(source.toString(), 'repoctl/tooling') : migrated)
          reason = migrated === original ? 'managed-asset' : 'tooling-reference-migration'
        }
        const semantic = reason.endsWith('semantic-merge') || reason === 'tooling-reference-migration'
        const result = skip ? { content: after } : await baseline.asset(filename, assetPath, source, upstream, semantic)
        if (!result) {
          continue
        }
        if (!semantic) {
          after = result.content
        }
        if ('reason' in result && result.reason) {
          reason = result.reason
        }
        const file = await put(filename, after, reason, reason.replaceAll('-', ' '), { skip, force: filename === '.github/workflows/release.yml' && options.overwriteRelease === true })
        baseline.annotate(file, result)
        if (hooks.migrate && hookTargets.includes(filename)) {
          file.group = hookGroup
        }
      }
      catch (error) {
        context.conflict(filename, error)
      }
    }
  }
  await walk('')
  if (hooks.migrate) {
    for (const filename of hooks.files) {
      await put(filename, null, 'legacy-hooks-removed', 'Remove recognized default hook files after migrating the complete setup.', { group: hookGroup })
      baseline.retire(filename)
    }
  }
  await baseline.removals()
  return baseline
}
