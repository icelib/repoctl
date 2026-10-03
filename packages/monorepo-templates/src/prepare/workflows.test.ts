import { expect, it } from 'vitest'
import YAML from 'yaml'
import { sanitizePublishedCiWorkflowContent } from './workflows'

it('removes adjacent source checks by command while preserving consumer steps and workflow metadata', () => {
  const content = `name: CI
on: [push]
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Component checks
        run: pnpm test:packaged-storybook
      - name: Arbitrary new source check
        env:
          CI: 'true'
        if: github.event_name == 'push'
        run: |
          # Source repository checks
          pnpm run test:packaged-future --flag
          pnpm run --if-present test:packaged-future
          pnpm test:worker-types
      - name: Browser setup
        run: pnpm exec playwright install --with-deps chromium
      - name: Source verification
        run: pnpm check:workflows
      - uses: actions/checkout@pinned
      - name: Build
        env:
          NODE_ENV: production
        if: github.event_name == 'push'
        run: pnpm build
      - name: Test
        run: |
          pnpm lint
          pnpm test
`
  const parsed = YAML.parse(sanitizePublishedCiWorkflowContent(content))
  expect(parsed.on).toEqual(['push'])
  expect(parsed.permissions).toEqual({ contents: 'read' })
  expect(parsed.jobs.build['runs-on']).toBe('ubuntu-latest')
  expect(parsed.jobs.build.steps).toEqual([
    { uses: 'actions/checkout@pinned' },
    { name: 'Build', env: { NODE_ENV: 'production' }, if: 'github.event_name == \'push\'', run: 'pnpm build' },
    { name: 'Test', run: 'pnpm lint\npnpm test\n' },
  ])
})

it.each([
  'pnpm test:packaged-future && pnpm build',
  'pnpm build && pnpm test:packaged-future',
  'pnpm test:packaged-future; pnpm build',
  'pnpm build || pnpm run --if-present test:packaged-future',
  'pnpm --filter workspace test:packaged-future',
])('rejects compound or unrecognized source commands: %s', (run) => {
  const content = YAML.stringify({ jobs: { test: { steps: [{ run }] } } })
  expect(() => sanitizePublishedCiWorkflowContent(content)).toThrow('separate CI steps')
})

it('handles CRLF and keeps already publishable workflows byte-for-byte unchanged', () => {
  const clean = 'jobs:\r\n  test:\r\n    steps:\r\n      - run: pnpm test\r\n'
  expect(sanitizePublishedCiWorkflowContent(clean)).toBe(clean)
  const source = clean.replace('pnpm test', 'pnpm test:packaged-react-lib')
  expect(YAML.parse(sanitizePublishedCiWorkflowContent(source)).jobs.test.steps).toEqual([])
})

it('rejects invalid YAML and mixed source/consumer steps instead of publishing broken commands', () => {
  expect(() => sanitizePublishedCiWorkflowContent('jobs: [')).toThrow('invalid CI workflow')
  const content = 'jobs:\n  test:\n    steps:\n      - run: |\n          pnpm build\n          pnpm test:packaged-react\n'
  expect(() => sanitizePublishedCiWorkflowContent(content)).toThrow('separate CI steps')
})
