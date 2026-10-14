import { expect, it } from 'vitest'
import YAML from 'yaml'
import { sanitizePublishedReleaseWorkflowContent } from './release'

it('preserves consumer release phases while removing source approval dispatch and Actions write permission', () => {
  const content = `# repoctl-managed: release/v2
name: Release
on: [push]
permissions:
  contents: write
  pull-requests: write
  id-token: write
  actions: write
jobs:
  release:
    steps:
      - name: Build Release Tooling
        run: pnpm run tooling:build
      - id: release-prepare
        run: pnpm exec repo release ci --stage prepare
      - id: pr-ci-approval
        env:
          GITHUB_TOKEN: token
        run: node .github/pr-ci/index.mjs release
      - id: release-upload
        run: pnpm exec repo release ci --stage upload
`
  const output = sanitizePublishedReleaseWorkflowContent(content)
  const workflow = YAML.parse(output)
  expect(output).toContain('# repoctl-managed: release/v2')
  expect(workflow.on).toEqual(['push'])
  expect(workflow.permissions).toEqual({ 'contents': 'write', 'pull-requests': 'write', 'id-token': 'write' })
  expect(workflow.jobs.release.steps).toEqual([
    { id: 'release-prepare', run: 'pnpm exec repo release ci --stage prepare' },
    { id: 'release-upload', run: 'pnpm exec repo release ci --stage upload' },
  ])
  expect(output).not.toContain('pr-ci')
  expect(sanitizePublishedReleaseWorkflowContent(output)).toBe(output)
})

it('preserves existing consumer release definitions and rejects invalid YAML', () => {
  const content = 'on: [push]\npermissions:\n  contents: write\njobs: {}\n'
  expect(sanitizePublishedReleaseWorkflowContent(content)).toBe(content)
  expect(() => sanitizePublishedReleaseWorkflowContent('jobs: [')).toThrow('invalid release workflow')
})
