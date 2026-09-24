import YAML from 'yaml'

export function sanitizePublishedManifestContent(content: string) {
  const manifest = JSON.parse(content) as { scripts?: Record<string, string> }
  if (manifest.scripts) {
    for (const name of Object.keys(manifest.scripts)) {
      if (name.startsWith('dev:') || name === 'test:dev-scenarios' || name === 'test:worker-types' || name === 'test:packaged-create') {
        delete manifest.scripts[name]
      }
    }
    // Source profiles reference packages and scripts that consumers do not receive.
    manifest.scripts['dev'] = 'turbo run dev --concurrency=20'
    if (manifest.scripts['test']) {
      manifest.scripts['test'] = manifest.scripts['test'].replace(' && pnpm test:dev-scenarios', '')
    }
  }
  return `${JSON.stringify(manifest, null, 2)}\n`
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
    'export default defineConfig(async () => await defineVitestConfig())',
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
