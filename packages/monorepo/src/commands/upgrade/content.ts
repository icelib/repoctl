import type { PackageJson } from '../../types'
import { Buffer } from 'node:buffer'
import { updateIssueTemplateConfig } from '../../utils'
import fs from '../../utils/fs'
import { migrateLegacyToolingReferences } from '../tooling-migration'
import { isAgentsMarkdownEquivalent, mergeAgentsMarkdown } from './agents'
import { setPkgJson } from './pkg-json'
import { isTextEquivalent, mergeGitignore } from './text'
import { getWorkspaceUpgradeContent } from './workspace'

export async function getUpgradeContent(
  sourcePath: string,
  relativePath: string,
  before: Buffer | undefined,
  repoName: string | undefined,
  scripts: Record<string, string> | undefined,
) {
  const source = await fs.readFile(sourcePath)
  if (relativePath === 'package.json' && before) {
    const target = JSON.parse(before.toString('utf8')) as PackageJson
    setPkgJson(JSON.parse(source.toString('utf8')), target, {
      ...(scripts ? { scripts } : {}),
      preserveLegacyRelease: true,
    })
    return Buffer.from(`${JSON.stringify(target, null, 2)}\n`)
  }
  if (relativePath === 'pnpm-workspace.yaml') {
    return getWorkspaceUpgradeContent(source, before)
  }
  const previousText = before?.toString('utf8')
  const sourceText = source.toString('utf8')
  if (relativePath === '.gitignore' && previousText !== undefined) {
    const merged = mergeGitignore(sourceText, previousText)
    return isTextEquivalent(previousText, merged) ? before! : Buffer.from(merged)
  }
  if (relativePath === 'AGENTS.md' && previousText !== undefined) {
    const merged = mergeAgentsMarkdown(sourceText, previousText)
    return isAgentsMarkdownEquivalent(previousText, merged) ? before! : Buffer.from(merged)
  }
  if (relativePath === '.github/ISSUE_TEMPLATE/config.yml') {
    return Buffer.from(updateIssueTemplateConfig(sourceText, repoName))
  }
  if (/\.(?:js|mjs|ts|mts|cjs|cts)$/.test(relativePath)) {
    const text = previousText ?? sourceText
    const migrated = migrateLegacyToolingReferences(text, 'repoctl/tooling')
    return Buffer.from(migrated === text ? migrateLegacyToolingReferences(sourceText, 'repoctl/tooling') : migrated)
  }
  return source
}
