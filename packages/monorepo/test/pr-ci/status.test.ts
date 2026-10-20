import { describe, expect, it } from 'vitest'
import { reportValidation } from '../../../../.github/pr-ci/status.mjs'
import { baseSha, fixture, headSha, preparedSha } from './fixture'

function reportOptions() {
  return {
    number: 42,
    headSha,
    baseSha,
    baseRef: 'main',
    headRef: 'feature/fix',
    headRepository: 'acme/repo',
    releaseLabels: [] as string[],
    runCi: true,
    runDevcontainer: false,
    results: { ci: 'success', devcontainer: 'skipped', releaseIntent: 'success' },
  }
}

describe('native PR Validation result', () => {
  it('returns success without reading or writing commit statuses', async () => {
    const h = fixture()
    await expect(reportValidation(h.client, reportOptions())).resolves.toHaveProperty('success', true)
    expect(h.client.createStatus).not.toHaveBeenCalled()
    expect(h.client.getStatus).not.toHaveBeenCalled()
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

  it.each(['failure', 'cancelled', 'skipped'])('rejects release-intent=%s even when heavy jobs were skipped', async (releaseIntent) => {
    const h = fixture()
    const options = reportOptions()
    options.results = { ci: 'skipped', devcontainer: 'skipped', releaseIntent }
    await expect(reportValidation(h.client, options)).resolves.toHaveProperty('success', false)
  })

  it('allows explicitly inapplicable CI and Dev Container checks to be skipped', async () => {
    const h = fixture()
    const options = reportOptions()
    options.runCi = false
    options.results.ci = 'skipped'
    await expect(reportValidation(h.client, options)).resolves.toHaveProperty('success', true)
  })

  it.each(['head', 'branch head', 'base', 'base metadata', 'retargeted', 'head ref', 'repository', 'closed', 'draft'])('invalidates successful jobs after the PR changes: %s', async (kind) => {
    const h = fixture()
    if (kind === 'head') {
      h.pr.head.sha = preparedSha
    }
    if (kind === 'branch head' || kind === 'base') {
      h.client.getRef.mockImplementation(async ref => ({ object: {
        sha: ref === 'heads/feature/fix' ? kind === 'branch head' ? preparedSha : headSha : kind === 'base' ? preparedSha : baseSha,
      } }))
    }
    if (kind === 'base metadata') {
      h.pr.base.sha = preparedSha
    }
    if (kind === 'retargeted') {
      h.pr.base.ref = 'other-base'
    }
    if (kind === 'head ref') {
      h.pr.head.ref = 'other-head'
    }
    if (kind === 'repository') {
      h.pr.head.repo.full_name = 'other/repo'
    }
    if (kind === 'closed') {
      h.pr.state = 'closed'
    }
    if (kind === 'draft') {
      h.pr.draft = true
    }
    await expect(reportValidation(h.client, reportOptions())).resolves.toMatchObject({ success: false, description: expect.stringContaining('changed') })
    expect(h.client.createStatus).not.toHaveBeenCalled()
  })

  it('accepts previously successful dependencies when rerunning only failed jobs', async () => {
    const h = fixture()
    const options = reportOptions()
    options.runDevcontainer = true
    options.results.devcontainer = 'failure'
    await expect(reportValidation(h.client, options)).resolves.toHaveProperty('success', false)
    options.results.devcontainer = 'success'
    await expect(reportValidation(h.client, options)).resolves.toHaveProperty('success', true)
    expect(h.client.getStatus).not.toHaveBeenCalled()
    expect(h.client.createStatus).not.toHaveBeenCalled()
  })

  it('rejects an old successful run after a release-level label changes on the same head', async () => {
    const h = fixture()
    h.pr.labels = [{ name: 'release:minor' }]
    await expect(reportValidation(h.client, reportOptions())).resolves.toHaveProperty('success', false)
    h.pr.labels = [{ name: 'bug' }]
    await expect(reportValidation(h.client, reportOptions())).resolves.toHaveProperty('success', true)
  })
})
