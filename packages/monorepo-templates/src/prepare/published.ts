import YAML from 'yaml'
import { createWorkspaceManifest } from '../workspace-manifest'

export function sanitizePublishedManifestContent(content: string) {
  const manifest = createWorkspaceManifest(JSON.parse(content))
  return `${JSON.stringify(manifest, null, 2)}\n`
}

export function sanitizePublishedCiContent(content: string) {
  const workflow = YAML.parseDocument(content)
  const steps = workflow.getIn(['jobs', 'build', 'steps'])
  if (!YAML.isSeq(steps)) {
    return content
  }
  const scripts = createWorkspaceManifest({}).scripts!
  steps.items = steps.items.filter((step) => {
    if (!YAML.isMap(step)) {
      return true
    }
    const command = step.get('run')
    if (typeof command !== 'string') {
      return true
    }
    const match = /^pnpm (?:run )?([\w:-]+)$/.exec(command.trim())
    return !match || Object.hasOwn(scripts, match[1]!)
  })
  return workflow.toString()
}

export const publishedToolingConfigs = {
  'commitlint.config.ts': [
    `import { defineCommitlintConfig } from 'repoctl/tooling'`,
    '',
    'export default await defineCommitlintConfig()',
    '',
  ].join('\n'),
  'eslint.config.js': [
    `import { defineEslintConfig } from 'repoctl/tooling'`,
    '',
    'export default await defineEslintConfig()',
    '',
  ].join('\n'),
  'lint-staged.config.js': [
    `import { defineLintStagedConfig } from 'repoctl/tooling'`,
    '',
    'export default await defineLintStagedConfig()',
    '',
  ].join('\n'),
  'stylelint.config.js': [
    `import { defineStylelintConfig } from 'repoctl/tooling'`,
    '',
    'export default await defineStylelintConfig()',
    '',
  ].join('\n'),
  'vitest.config.ts': [
    `import { defineConfig } from 'vitest/config'`,
    `import { defineVitestConfig } from 'repoctl/tooling'`,
    '',
    'export default defineConfig(async () => {',
    '  const config = await defineVitestConfig()',
    '  if (config.test?.projects?.length === 0) {',
    '    const { projects: _projects, ...test } = config.test',
    '    return { ...config, test: { ...test, passWithNoTests: true } }',
    '  }',
    '  return config',
    '})',
    '',
  ].join('\n'),
}
const sourceRepoReleaseToolingBuildStepPattern = /\r?\n\s+- name: Build Release Tooling\r?\n\s+run: pnpm run tooling:build\r?\n/g

export function removeSourceRepoReleaseToolingBuildStepContent(content: string) {
  return content.replaceAll(sourceRepoReleaseToolingBuildStepPattern, '\n')
}

export function sanitizePublishedWorkspaceContent(content: string) {
  const workspace = YAML.parse(content) as {
    catalog?: unknown
    catalogs?: unknown
    versioning?: Record<string, unknown>
  } | null
  if (!workspace || typeof workspace !== 'object') {
    return content
  }

  let changed = false
  if (workspace.versioning && typeof workspace.versioning === 'object') {
    delete workspace.versioning['fixed']
    delete workspace.versioning['ignore']
    delete workspace.versioning['lanes']
    changed = true
  }
  if ('catalog' in workspace) {
    delete workspace.catalog
    changed = true
  }
  if ('catalogs' in workspace) {
    delete workspace.catalogs
    changed = true
  }

  return changed ? YAML.stringify(workspace) : content
}
