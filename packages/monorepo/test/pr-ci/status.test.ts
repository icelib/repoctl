import { expect, it } from 'vitest'
import { reportValidation } from '../../../../.github/pr-ci/status.mjs'
import { baseSha, fixture, headSha, preparedSha } from './fixture'

function reportOptions() {
  return {
    number: 42,
    headSha,
    baseSha,
    runCi: true,
    runDevcontainer: false,
    results: { ci: 'success', devcontainer: 'skipped', releaseIntent: 'success' },
    targetUrl: 'https://github.com/acme/repo/actions/runs/123',
  }
}

it('reports successful applicable checks on the PR head instead of the base workflow commit', async () => {
  const h = fixture()
  await expect(reportValidation(h.client, reportOptions())).resolves.toHaveProperty('success', true)
  expect(h.client.createStatus).toHaveBeenCalledWith(headSha, expect.objectContaining({ state: 'success', context: 'PR Validation' }))
})

it.each(['failure', 'cancelled', 'skipped', 'timed_out'])('rejects an applicable CI result of %s', async (ci) => {
  const h = fixture()
  const options = reportOptions()
  options.results.ci = ci
  await expect(reportValidation(h.client, options)).resolves.toHaveProperty('success', false)
})

it('requires both architectures to succeed when Dev Container is applicable', async () => {
  const h = fixture()
  const options = reportOptions()
  options.runDevcontainer = true
  options.results.devcontainer = 'failure'
  await expect(reportValidation(h.client, options)).resolves.toHaveProperty('success', false)
})

it('allows explicitly inapplicable CI and Dev Container checks to be skipped', async () => {
  const h = fixture()
  const options = reportOptions()
  options.runCi = false
  options.results.ci = 'skipped'
  await expect(reportValidation(h.client, options)).resolves.toHaveProperty('success', true)
})

it.each(['head', 'base', 'closed', 'draft'])('invalidates successful jobs after the PR becomes %s', async (kind) => {
  const h = fixture()
  if (kind === 'head') {
    h.pr.head.sha = preparedSha
  }
  if (kind === 'base') {
    h.client.getRef.mockResolvedValue({ object: {
      sha: preparedSha,
    } })
  }
  if (kind === 'closed') {
    h.pr.state = 'closed'
  }
  if (kind === 'draft') {
    h.pr.draft = true
  }
  await expect(reportValidation(h.client, reportOptions())).resolves.toMatchObject({ success: false, description: expect.stringContaining('changed') })
})

it('keeps a cancelled older run from overwriting a newer approval result', async () => {
  const h = fixture()
  h.client.getStatus.mockResolvedValue({ statuses: [{ context: 'PR Validation', target_url: 'https://github.com/acme/repo/actions/runs/456' }] })
  await expect(reportValidation(h.client, reportOptions())).resolves.toMatchObject({ success: false, description: expect.stringContaining('newer approval') })
  expect(h.client.createStatus).not.toHaveBeenCalled()
})
