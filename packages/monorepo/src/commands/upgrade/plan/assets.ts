import type { PackageJson } from '../../../types'
import type { UpgradeContext } from './context'
import { Buffer } from 'node:buffer'
import { readdir } from 'node:fs/promises'
import path from 'pathe'
import YAML from 'yaml'
import { GitClient } from '../../../core/git'
import { toWorkspaceAssetPath, updateIssueTemplateConfig } from '../../../utils'
import { migrateLegacyToolingReferences } from '../../tooling-migration'
import { isAgentsMarkdownEquivalent, mergeAgentsMarkdown } from '../agents'
import { setPkgJson } from '../pkg-json'
import { isLegacyReleaseWorkflow, releaseWorkflowMarker } from '../release-migration/classify'
import { isTextEquivalent, mergeGitignore } from '../text'
import { mergeWorkspaceManifest, normalizeWorkspaceManifest } from '../workspace'

export async function planAssets(context: UpgradeContext) {
  const { plan, read, put, options, config } = context
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
        let after = source
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
        else if (filename === '.github/workflows/release.yml' && before !== null && !options.overwriteRelease
          && !before.toString().includes(releaseWorkflowMarker) && !isLegacyReleaseWorkflow(before.toString())) {
          reason = 'custom-release-protected'
          skip = true
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
          reason = 'repository-issue-links'
        }
        else if (/\.(?:js|mjs|ts|mts|cjs|cts)$/.test(filename)) {
          const original = (before ?? source).toString()
          const migrated = migrateLegacyToolingReferences(original, 'repoctl/tooling')
          after = Buffer.from(migrated === original ? migrateLegacyToolingReferences(source.toString(), 'repoctl/tooling') : migrated)
          reason = migrated === original ? 'managed-asset' : 'tooling-reference-migration'
        }
        await put(filename, after, reason, reason.replaceAll('-', ' '), { skip, force: filename === '.github/workflows/release.yml' && options.overwriteRelease === true })
      }
      catch (error) {
        context.conflict(filename, error)
      }
    }
  }
  await walk('')
}
