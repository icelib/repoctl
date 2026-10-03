import type { CapabilitySettings } from './files'
import YAML from 'yaml'

export function playwrightWorkflow({ workspace }: CapabilitySettings) {
  // Names and paths come from normalized settings, never arbitrary shell snippets.
  const filter = `'${workspace.name}'`
  const run = `pnpm --filter ${filter}`
  return YAML.stringify({
    name: `E2E ${workspace.name}`,
    on: { pull_request: {}, workflow_dispatch: {} },
    permissions: { contents: 'read' },
    jobs: {
      e2e: {
        'runs-on': 'ubuntu-latest',
        'timeout-minutes': 15,
        'env': { CI: 'true' },
        'steps': [
          { uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1' },
          { uses: 'pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413' },
          { uses: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020', with: { 'node-version': 22 } },
          { name: 'Install workspace dependencies', run: 'pnpm install --frozen-lockfile' },
          { name: 'Build application dependencies', run: `pnpm exec turbo run build --filter=${filter}...` },
          { name: 'Lint E2E configuration and tests', run: `${run} run lint` },
          { name: 'Check E2E types', run: `${run} run typecheck` },
          { name: 'Install Chromium explicitly', run: `${run} exec playwright install --with-deps chromium` },
          { name: 'Run headless E2E', run: `${run} run test:e2e` },
          { name: 'Upload report and failure traces', if: ['$', '{{ always() }}'].join(''), uses: 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a', with: { 'name': workspace.name.replace(/[^a-z0-9-]/gi, '-'), 'path': `${workspace.directory}/playwright-report\n${workspace.directory}/test-results`, 'retention-days': 7 } },
        ],
      },
    },
  })
}
