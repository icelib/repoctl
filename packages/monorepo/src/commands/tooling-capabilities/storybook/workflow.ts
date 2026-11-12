import type { StorybookSettings } from '../settings'
import YAML from 'yaml'
import { defaultNodeVersion } from '../../../core/runtime/node'

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
          { uses: 'pnpm/action-setup@9bbca1e9dc2902adb87e8780fe5c98796985a62d' },
          { uses: 'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1', with: { 'node-version': defaultNodeVersion } },
          { name: 'Install workspace dependencies', run: 'pnpm install --frozen-lockfile' },
          { name: 'Build library and static stories', run: `pnpm exec turbo run build:storybook --filter=${filter}` },
          { name: 'Lint stories and configuration', run: `${run} run lint` },
          { name: 'Check stories and configuration types', run: `${run} run typecheck` },
          { name: 'Install Chromium explicitly', run: `${run} exec playwright install --with-deps chromium` },
          { name: 'Run headless interaction tests', run: `${run} run test:storybook` },
          { name: 'Upload static stories and test report', if: ['$', '{{ always() }}'].join(''), uses: 'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9', with: { 'name': workspace.name.replace(/[^a-z0-9-]/gi, '-'), 'path': `${workspace.directory}/storybook-static\n${workspace.directory}/test-results`, 'retention-days': 7 } },
        ],
      },
    },
  })
}
