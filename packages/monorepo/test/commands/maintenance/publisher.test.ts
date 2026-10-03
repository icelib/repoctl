import { lstat, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getMaintenanceWorkflow, prepareMaintenanceUpgrade } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import YAML from 'yaml'
import { fixture } from './fixture'

const { validateMaintenanceArtifact } = await import(new URL('../../../resources/maintenance/validate.mjs', import.meta.url).href)

async function publisherFixture() {
  const h = await fixture()
  const report = await prepareMaintenanceUpgrade(h.options)
  expect(report.status, report.errors.join()).toBe('ready')
  const cwd = path.join(h.root, 'publisher')
  h.git(['clone', '-q', '--no-hardlinks', h.cwd, cwd], h.root)
  const input = { cwd, directory: h.options.outputDirectory, expected: h.expected, request: h.request }
  return { ...h, report, input }
}

it('validates immutable provenance and exact patch bytes without executing workspace hooks', async () => {
  const h = await publisherFixture()
  const marker = path.join(h.root, 'hook-ran')
  await writeFile(path.join(h.input.cwd, '.git/hooks/post-checkout'), `#!/bin/sh\necho ran > '${marker}'\n`, { mode: 0o755 })
  const result = await validateMaintenanceArtifact(h.input)
  expect(result).toMatchObject({ ready: true, branch: 'repoctl/managed-assets' })
  expect(h.git(['symbolic-ref', '--short', 'HEAD'], h.input.cwd)).toBe('main')
  expect(h.git(['rev-parse', 'refs/remotes/origin/main'], h.input.cwd)).toBe(h.head)
  expect(h.git(['config', '--local', 'core.hooksPath'], h.input.cwd)).toBe(path.join(h.options.outputDirectory, 'empty-hooks'))
  expect(await readFile(result.bodyFile, 'utf8')).toContain('lint: passed')
  expect(await lstat(marker).catch(() => null)).toBeNull()
})

it.each(['runId', 'runAttempt', 'repository', 'head', 'base'])('blocks cross-source artifact reuse through %s', async (field) => {
  const h = await publisherFixture()
  await expect(validateMaintenanceArtifact({ ...h.input, expected: { ...h.expected, [field]: 'wrong' } })).rejects.toThrow('another repository, commit or workflow attempt')
  expect(h.git(['status', '--porcelain'], h.input.cwd)).toBe('')
})

it('blocks tampered archives, patch bytes, paths and Git modes before requesting credentials', async () => {
  const h = await publisherFixture()
  const request = async (route: string) => {
    const response = await h.request(route)
    return route.endsWith('/actions/artifacts/{artifact_id}') ? { data: { ...response.data, digest: `sha256:${'b'.repeat(64)}` } } : response
  }
  await expect(validateMaintenanceArtifact({ ...h.input, request })).rejects.toThrow('immutable digest')
  const reportPath = path.join(h.options.outputDirectory, 'report.json')
  await writeFile(reportPath, JSON.stringify({ ...h.report, files: [{ ...h.report.files[0], path: '../escape' }] }))
  await expect(validateMaintenanceArtifact(h.input)).rejects.toThrow('unapproved')
  await writeFile(reportPath, JSON.stringify({ ...h.report, files: [{ ...h.report.files[0], afterMode: '120000' }] }))
  await expect(validateMaintenanceArtifact(h.input)).rejects.toThrow('Git mode')
  await writeFile(reportPath, JSON.stringify(h.report))
  await writeFile(path.join(h.options.outputDirectory, 'changes.patch'), 'tampered')
  await expect(validateMaintenanceArtifact(h.input)).rejects.toThrow('digest changed')
  expect(h.git(['status', '--porcelain'], h.input.cwd)).toBe('')
})

it('surfaces missing App configuration and rejected API permissions without changing the checkout', async () => {
  const h = await publisherFixture()
  await expect(validateMaintenanceArtifact({ ...h.input, expected: { ...h.expected, appConfigured: false } })).rejects.toThrow('contents, pull requests and workflows')
  await expect(validateMaintenanceArtifact({ ...h.input, request: async () => {
    throw new Error('403 Resource not accessible')
  } })).rejects.toThrow('permission or source verification failed: 403')
  expect(h.git(['status', '--porcelain'], h.input.cwd)).toBe('')
})

it('does not acquire credentials or inspect repository permissions for a no-diff report', async () => {
  const h = await fixture()
  const report = await prepareMaintenanceUpgrade({ ...h.options, base: h.head })
  expect(report.status).toBe('unchanged')
  const result = await validateMaintenanceArtifact({ cwd: h.cwd, directory: h.options.outputDirectory, expected: { ...h.expected, base: h.head, appConfigured: false }, request: async () => {
    throw new Error('must not run')
  } })
  expect(result.ready).toBe(false)
})

it('exports two jobs, immutable artifact selection, a fixed PR branch and no publisher project execution', async () => {
  const workflow = await getMaintenanceWorkflow()
  const parsed = YAML.parse(workflow)
  expect(parsed.permissions).toEqual({ contents: 'read' })
  expect(parsed.on).not.toHaveProperty('pull_request_target')
  expect(parsed.jobs.prepare.if).toContain('default_branch')
  const steps = parsed.jobs.propose.steps
  expect(steps.every((step: Record<string, unknown>) => !step['run'])).toBe(true)
  expect(steps.find((step: { uses: string }) => step.uses.startsWith('actions/download-artifact')).with['artifact-ids']).toContain('needs.prepare.outputs.artifact-id')
  const validator = steps.find((step: { id?: string }) => step.id === 'verify').with.script
  expect(validator).toContain('git([\'checkout\', \'-B\', expected.defaultBranch, expected.head])')
  expect(validator).toContain('refs/remotes/origin/' + '$' + '{expected.defaultBranch}')
  expect(validator).not.toContain('import(' + '\'repoctl')
  const token = steps.find((step: { id?: string }) => step.id === 'app')
  expect(token.if).toBe('steps.verify.outputs.ready == \'true\'')
  expect(token.with['permission-workflows']).toBe('write')
  const proposal = steps.at(-1)
  expect(proposal.with.branch).toBe('repoctl/managed-assets')
  expect(proposal.with).not.toHaveProperty('branch-suffix')
  expect(proposal.with.base).toContain('default_branch')
  expect(proposal.uses).toBe('peter-evans/create-pull-request@5f6978faf089d4d20b00c7766989d076bb2fc7f1')
  expect(steps.every((step: { uses: string }) => /@[a-f0-9]{40}$/.test(step.uses))).toBe(true)
})
