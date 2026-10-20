import { describe, expect, it } from 'vitest'
import { prepareManualValidation, reportManualValidation } from '../../../../.github/pr-ci/manual.mjs'
import { baseSha, fixture, headSha, mergeSha, preparedSha } from './fixture'

const targetUrl = 'https://github.com/acme/repo/actions/runs/123'

function reportOptions() {
  return {
    number: 42,
    headSha,
    baseSha,
    baseRef: 'main',
    headRef: 'feature/fix',
    headRepository: 'acme/repo',
    releaseLabels: [],
    runCi: true,
    runDevcontainer: false,
    results: { ci: 'success', devcontainer: 'skipped', releaseIntent: 'success' },
    targetUrl,
  }
}

describe('manual PR diagnostics status isolation', () => {
  it('freezes the current PR and writes only the manual pending context', async () => {
    const h = fixture()
    await expect(prepareManualValidation(h.client, { number: 42, targetUrl, wait: h.options.wait })).resolves.toMatchObject({
      head_sha: headSha,
      base_sha: baseSha,
      merge_sha: mergeSha,
      release_labels: '[]',
    })
    expect(h.client.createStatus).toHaveBeenCalledExactlyOnceWith(headSha, expect.objectContaining({ state: 'pending', context: 'Manual PR Validation', target_url: targetUrl }))
    expect(h.client.createCommit).not.toHaveBeenCalled()
    expect(h.client.updateRef).not.toHaveBeenCalled()
    expect(h.client.createComment).not.toHaveBeenCalled()
  })

  it.each(['head', 'base', 'base ref', 'head ref', 'repository', 'release label'])('rejects a %s change between snapshot and preparation', async (kind) => {
    const h = fixture()
    h.client.getPullRequest.mockResolvedValueOnce(structuredClone(h.pr))
    if (kind === 'head') {
      h.pr.head.sha = preparedSha
    }
    if (kind === 'base') {
      h.pr.base.sha = preparedSha
    }
    if (kind === 'base ref') {
      h.pr.base.ref = 'other-base'
    }
    if (kind === 'head ref') {
      h.pr.head.ref = 'other-head'
    }
    if (kind === 'repository') {
      h.pr.head.repo.full_name = 'other/repo'
    }
    if (kind === 'release label') {
      h.pr.labels = [{ name: 'release:minor' }]
    }
    await expect(prepareManualValidation(h.client, { number: 42, targetUrl, wait: h.options.wait })).rejects.toThrow()
    expect(h.client.createStatus).toHaveBeenCalledExactlyOnceWith(headSha, expect.objectContaining({ state: 'failure', context: 'Manual PR Validation' }))
  })

  it('reports a manual result without publishing the native PR Validation context', async () => {
    const h = fixture()
    await expect(reportManualValidation(h.client, reportOptions())).resolves.toHaveProperty('success', true)
    expect(h.client.createStatus).toHaveBeenCalledExactlyOnceWith(headSha, expect.objectContaining({ state: 'success', context: 'Manual PR Validation', target_url: targetUrl }))
  })

  it('leaves the newer manual approval result unchanged after an old cancelled run', async () => {
    const h = fixture()
    h.client.getStatus.mockResolvedValue({ statuses: [{ context: 'Manual PR Validation', target_url: 'https://github.com/acme/repo/actions/runs/456' }] })
    await expect(reportManualValidation(h.client, reportOptions())).resolves.toMatchObject({ success: false, description: expect.stringContaining('newer approval') })
    expect(h.client.createStatus).not.toHaveBeenCalled()
  })

  it('does not mistake a native status for ownership of manual diagnostics', async () => {
    const h = fixture()
    h.client.getStatus.mockResolvedValue({ statuses: [{ context: 'PR Validation', target_url: targetUrl }] })
    await expect(reportManualValidation(h.client, reportOptions())).resolves.toHaveProperty('success', false)
    expect(h.client.createStatus).not.toHaveBeenCalled()
  })

  it('keeps the manual failure context when frozen branches move during validation', async () => {
    const h = fixture()
    h.pr.head.sha = preparedSha
    await expect(reportManualValidation(h.client, reportOptions())).resolves.toHaveProperty('success', false)
    expect(h.client.createStatus).toHaveBeenCalledWith(headSha, expect.objectContaining({ state: 'failure', context: 'Manual PR Validation' }))
  })
})
