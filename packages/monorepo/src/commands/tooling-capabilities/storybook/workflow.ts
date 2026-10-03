import type { StorybookSettings } from '../settings'
import YAML from 'yaml'

export function storybookWorkflow({ workspace }: StorybookSettings) {
  const filter = `'${workspace.name}'`
  const run = `pnpm --filter ${filter}`
  return YAML.stringify({
    name: `Storybook ${workspace.name}`,
    on: { pull_request: {}, workflow_dispatch: {} },
    permissions: { contents: 'read' },
    jobs: {
      storybook: {
        'runs-on': 'ubuntu-latest',
        'timeout-minutes': 15,
        'env': { CI: 'true' },
        'steps': [
          { uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1' },
          { uses: 'pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413' },
          { uses: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020', with: { 'node-version': 22 } },
          { name: 'Install workspace dependencies', run: 'pnpm install --frozen-lockfile' },
          { name: 'Build library and static stories', run: `pnpm exec turbo run build:storybook --filter=${filter}` },
          { name: 'Lint stories and configuration', run: `${run} run lint` },
          { name: 'Check stories and configuration types', run: `${run} run typecheck` },
          { name: 'Install Chromium explicitly', run: `${run} exec playwright install --with-deps chromium` },
          { name: 'Run headless interaction tests', run: `${run} run test:storybook` },
          { name: 'Upload static stories and test report', if: ['$', '{{ always() }}'].join(''), uses: 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a', with: { 'name': workspace.name.replace(/[^a-z0-9-]/gi, '-'), 'path': `${workspace.directory}/storybook-static\n${workspace.directory}/test-results`, 'retention-days': 7 } },
        ],
      },
    },
  })
}
