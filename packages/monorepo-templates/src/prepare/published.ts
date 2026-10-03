import YAML from 'yaml'

const sourceScriptNames = new Set(['tooling:build', 'check:no-tracked-build-artifacts', 'check:workflows', 'test:dev-scenarios', 'test:worker-types'])

export const isSourceOnlyScript = (name: string) => name.startsWith('dev:') || sourceScriptNames.has(name) || name.startsWith('test:packaged-')

export function sanitizePublishedManifestContent(content: string) {
  const manifest = JSON.parse(content) as { scripts?: Record<string, string>, devDependencies?: Record<string, string> }
  // Generated configs import repoctl/tooling, which owns the shared config dependencies.
  if (manifest.devDependencies) {
    for (const name of ['@icebreakers/commitlint-config', '@icebreakers/eslint-config', '@icebreakers/monorepo', '@icebreakers/stylelint-config', 'playwright']) {
      delete manifest.devDependencies[name]
    }
    if (manifest.devDependencies['repoctl']?.startsWith('workspace:')) {
      manifest.devDependencies['repoctl'] = 'latest'
    }
  }
  if (manifest.scripts) {
    for (const name of Object.keys(manifest.scripts)) {
      if (isSourceOnlyScript(name)) {
        delete manifest.scripts[name]
      }
    }
    // Source profiles reference packages and scripts that consumers do not receive.
    manifest.scripts['dev'] = 'turbo run dev --concurrency=20'
    if (manifest.scripts['lint']) {
      manifest.scripts['lint'] = manifest.scripts['lint'].replace(/^pnpm run tooling:build && /u, '')
    }
    if (manifest.scripts['test']) {
      manifest.scripts['test'] = manifest.scripts['test'].replace(' && pnpm test:dev-scenarios', '')
    }
    for (const name of ['test', 'test:dev']) {
      if (manifest.scripts[name]) {
        manifest.scripts[name] = manifest.scripts[name].replace('pnpm check:no-tracked-build-artifacts && ', '')
      }
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
