import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import { assetsDir } from '@icebreakers/monorepo-templates'
import { expect, it } from 'vitest'
import YAML from 'yaml'
import { rootDir } from '@/constants'
import { checkBootstrapWorkflow } from '../../../../../scripts/workflows/bootstrap.mjs'

async function workflow(root = rootDir) {
  return YAML.parse(await readFile(path.join(root, '.github/workflows/release.yml'), 'utf8'))
}

it.each([rootDir, assetsDir])('isolates bootstrap source execution from OIDC and verification in %s', async (root) => {
  const source = await workflow(root)
  expect(() => checkBootstrapWorkflow(source)).not.toThrow()
  expect(source.on.workflow_dispatch.inputs.mode.options).toContain('bootstrap')
  expect(source.on.workflow_dispatch.inputs.tag).toMatchObject({ default: 'alpha', type: 'string' })
  expect(source.on.workflow_dispatch.inputs['verify-run-id'].type).toBe('string')
  expect(source.jobs.release.if).toContain('inputs.mode != \'bootstrap\'')
  expect(source.concurrency).toEqual({ 'group': '$' + '{{ github.workflow }}-$' + '{{ github.ref }}', 'cancel-in-progress': false })

  const prepare = source.jobs['bootstrap-prepare']
  expect(prepare.name).toBe('Prepare bootstrap package')
  expect(prepare.permissions).toEqual({ contents: 'read' })
  expect(prepare.steps.find((step: { uses?: string }) => step.uses?.startsWith('actions/checkout@')).with).toMatchObject({ 'persist-credentials': false, 'ref': '$' + '{{ github.sha }}' })
  expect(prepare.steps.some((step: { run?: string }) => step.run === 'pnpm install --frozen-lockfile --ignore-scripts')).toBe(true)
  const artifact = prepare.steps.find((step: { uses?: string }) => step.uses?.startsWith('actions/upload-artifact@'))
  expect(artifact.with).toMatchObject({
    'name': 'repoctl-bootstrap-$' + '{{ github.run_id }}-$' + '{{ github.run_attempt }}',
    'path': '$' + '{{ runner.temp }}/repoctl-bootstrap/bootstrap-manifest.json\n$' + '{{ runner.temp }}/repoctl-bootstrap/tarballs/\n',
    'if-no-files-found': 'error',
  })

  const publisher = source.jobs['bootstrap-publish']
  const verifier = source.jobs['bootstrap-verify']
  expect(publisher.name).toBe('Publish bootstrap package')
  expect(publisher.permissions).toEqual({ 'contents': 'read', 'actions': 'read', 'id-token': 'write' })
  expect(verifier.permissions).toEqual({ contents: 'read', actions: 'read' })
  for (const job of [publisher, verifier]) {
    expect(job.env.REPOCTL_BOOTSTRAP_TOOL_VERSION).toMatch(/^\d+\.\d+\.\d+(?:-[\dA-Z.-]+)?$/i)
    const steps = job.steps as { uses?: string, id?: string, run?: string }[]
    expect(steps.some(step => step.uses?.startsWith('actions/checkout@'))).toBe(false)
    const install = steps.find(step => step.id === 'bootstrap-tool')!.run!
    expect(install).toContain('"repoctl@$REPOCTL_BOOTSTRAP_TOOL_VERSION"')
    expect(install).toContain('--ignore-scripts')
    expect(install).toContain('--registry=https://registry.npmjs.org')
    const serialized = JSON.stringify(job)
    for (const forbidden of ['pnpm ', 'tooling:build', 'NPM_TOKEN', 'NODE_AUTH_TOKEN', 'REPOCTL_RELEASE_TOKEN', 'create-github-app-token', 'repoctl@latest']) {
      expect(serialized).not.toContain(forbidden)
    }
  }
  const publication = publisher.steps.find((step: { uses?: string }) => step.uses?.startsWith('actions/upload-artifact@'))
  expect(publication.with.name).toBe('repoctl-bootstrap-publication-$' + '{{ github.run_id }}-$' + '{{ github.run_attempt }}')
  expect(JSON.stringify(verifier.steps)).toContain('--stage verify')
  expect(JSON.stringify(verifier.steps)).toContain('--verify-run-id')
  expect(JSON.stringify(verifier.steps)).not.toContain('--stage publish')
})

it.each([
  { verify: '', dryRun: false, prepare: 'pending', publish: 'pending', expected: ['bootstrap-prepare'] },
  { verify: '', dryRun: true, prepare: 'success', publish: 'pending', expected: ['bootstrap-prepare'] },
  { verify: '', dryRun: false, prepare: 'success', publish: 'pending', expected: ['bootstrap-prepare', 'bootstrap-publish'] },
  { verify: '', dryRun: false, prepare: 'failure', publish: 'skipped', expected: ['bootstrap-prepare'] },
  { verify: '', dryRun: false, prepare: 'success', publish: 'success', expected: ['bootstrap-prepare', 'bootstrap-publish', 'bootstrap-verify'] },
  { verify: '123', dryRun: false, prepare: 'skipped', publish: 'skipped', expected: ['bootstrap-verify'] },
])('routes bootstrap with verification input $verify and dry-run $dryRun safely', async (scenario) => {
  const source = await workflow()
  const selected = ['bootstrap-prepare', 'bootstrap-publish', 'bootstrap-verify'].filter((name) => {
    const expression = source.jobs[name].if.slice(3, -2).trim().replace(/\.(\w+-[\w-]+)/g, '["$1"]')
    return runInNewContext(expression, {
      cancelled: () => false,
      github: { event_name: 'workflow_dispatch' },
      inputs: { 'mode': 'bootstrap', 'verify-run-id': scenario.verify, 'dry-run': scenario.dryRun },
      needs: { 'bootstrap-prepare': { result: scenario.prepare }, 'bootstrap-publish': { result: scenario.publish } },
    }, { timeout: 1000 })
  })
  expect(selected).toEqual(scenario.expected)
})
