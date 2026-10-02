import type { KnipConfigurationSuggestions } from '../../../types/knip'
import { clearWorkspaceCache, getWorkspacePackageSummaries } from '../../../core/workspace'
import { hash } from '../../deps/files'
import { knipConfigurationInputs } from './inputs'
import { knipRoot } from './plan'

/** Return native settings for manual merging; existing Knip config always remains authoritative. */
export async function getKnipConfigurationSuggestions(cwd: string): Promise<KnipConfigurationSuggestions> {
  const root = await knipRoot(cwd)
  const inputs = await knipConfigurationInputs(root, null)
  clearWorkspaceCache()
  const packages = await getWorkspacePackageSummaries(root, { ignoreRootPackage: false, ignorePrivatePackage: false })
  const extensions = '{js,mjs,cjs,jsx,ts,tsx,mts,cts}'
  return {
    schemaVersion: 1,
    workspaceDir: root,
    existing: inputs.configuration.filter(item => !item.path.endsWith('#packages') && (item.path !== 'package.json#knip' || item.hash !== hash('null'))).map(item => item.path),
    suggested: {
      $schema: 'https://unpkg.com/knip@6/schema.json',
      ignore: ['**/dist/**', '**/coverage/**', '**/.turbo/**', '**/.vitepress/cache/**', '**/.vitepress/dist/**', '**/.astro/**', '**/worker-configuration.d.ts'],
      workspaces: Object.fromEntries(packages.packages.map(pkg => [pkg.relativeDir, {
        entry: [`{index,cli,main}.${extensions}`, `src/{index,cli,main}.${extensions}`, `bin/**/*.${extensions}`, `test-d/**/*.test-d.ts`, ...(pkg.relativeDir === '.' ? [`scripts/**/*.${extensions}`, `.github/**/*.${extensions}`] : [])],
        project: [`**/*.${extensions}`],
      }])),
    },
    guidance: [
      { key: 'workspaces', reason: 'Keep native pnpm workspace discovery and framework plugins. These entries cover repoctl library/CLI/app templates and type-test entrypoints; merge them into existing native settings instead of replacing user entries.' },
      { key: 'ignore', reason: 'Generated build, coverage, framework-cache and Worker type files are excluded explicitly; review generated patterns for your repository.' },
      { key: 'entry', reason: 'Add dynamically loaded modules and framework-specific entrypoints explicitly when their native plugin cannot infer them.' },
      { key: 'ignoreFiles / ignoreIssues', reason: 'Exclude reviewed example/fixture files or selected issue types using native Knip patterns. Examples are not silently ignored by this recommendation.' },
      { key: 'rules', reason: 'Use native rules such as { exports: "warn", unlisted: "error" }; repoctl preserves these severities and does not turn warnings into errors.' },
    ],
  }
}
