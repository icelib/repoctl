import { describe, expect, it } from 'vitest'
import { prepareValidation } from '../../../../.github/pr-ci/prepare.mjs'
import { baseSha, fixture, headSha, mergeSha, preparedSha } from './fixture'

describe('approved PR preparation', () => {
  it('freezes the final changeset commit and verifies test merge parents', async () => {
    const h = fixture()
    h.options.processIntent.mockImplementation(async () => {
      h.pr.head.sha = preparedSha
      return { action: 'committed', number: 42, path: '.changeset/auto-pr-42.md', sha: preparedSha }
    })
    const result = await prepareValidation(h.client, h.options)
    expect(result).toMatchObject({ head_sha: preparedSha, base_sha: baseSha, merge_sha: mergeSha, run_ci: true, run_devcontainer: false })
    expect(h.options.processIntent).toHaveBeenCalledWith(h.client, 42, { expectedHeadSha: headSha })
    expect(h.client.createStatus).toHaveBeenCalledWith(preparedSha, expect.objectContaining({ state: 'pending', context: 'PR Validation' }))
    expect(h.client.compareCommits).toHaveBeenCalledWith(baseSha, preparedSha)
  })

  it('waits for GitHub to update stale test merge parents after a changeset push', async () => {
    const h = fixture()
    h.client.getCommit.mockResolvedValueOnce({ parents: [{ sha: baseSha }, { sha: preparedSha }] })
    await expect(prepareValidation(h.client, h.options)).resolves.toHaveProperty('merge_sha', mergeSha)
    expect(h.options.wait).toHaveBeenCalledOnce()
  })

  it.each(['draft', 'closed', 'conflicting', 'outdated approval'])('rejects a %s PR before writing a changeset', async (kind) => {
    const h = fixture()
    if (kind === 'draft') {
      h.pr.draft = true
    }
    if (kind === 'closed') {
      h.pr.state = 'closed'
    }
    if (kind === 'conflicting') {
      h.pr.mergeable = false
    }
    if (kind === 'outdated approval') {
      h.pr.head.sha = preparedSha
    }
    await expect(prepareValidation(h.client, h.options)).rejects.toThrow()
    expect(h.options.processIntent).not.toHaveBeenCalled()
  })

  it('fails when an unrelated push races with preparation', async () => {
    const h = fixture()
    h.options.processIntent.mockImplementation(async () => {
      h.pr.head.sha = preparedSha
      return { action: 'skipped', number: 42 }
    })
    await expect(prepareValidation(h.client, h.options)).rejects.toThrow('changed during preparation')
    expect(h.client.createStatus).toHaveBeenCalledWith(headSha, expect.objectContaining({ state: 'failure' }))
  })

  it('fails when the target branch changes during preparation', async () => {
    const h = fixture()
    h.client.getRef.mockResolvedValueOnce({ object: { sha: baseSha } }).mockResolvedValue({ object: { sha: preparedSha } })
    await expect(prepareValidation(h.client, h.options)).rejects.toThrow('changed during preparation')
  })

  it('stops fork validation after asking the contributor to add a release intent', async () => {
    const h = fixture()
    h.pr.head.repo.full_name = 'contributor/repo'
    h.options.processIntent.mockResolvedValue({ action: 'commented', number: 42 })
    await expect(prepareValidation(h.client, h.options)).rejects.toThrow('Fork PRs must include')
    expect(h.client.getCommit).not.toHaveBeenCalled()
  })

  it.each(['fork', 'release', 'manual intent'])('validates a prepared %s PR without requiring an automatic commit', async (kind) => {
    const h = fixture()
    if (kind === 'fork') {
      h.pr.head.repo.full_name = 'contributor/repo'
    }
    if (kind === 'release') {
      h.pr.head.ref = 'pnpm-release/main'
    }
    await expect(prepareValidation(h.client, h.options)).resolves.toHaveProperty('head_sha', headSha)
  })

  it('does not accept an unavailable merge commit as successful preparation', async () => {
    const h = fixture()
    h.pr.mergeable = null
    await expect(prepareValidation(h.client, h.options)).rejects.toThrow('did not provide a current')
    expect(h.options.wait).toHaveBeenCalledTimes(11)
  })

  it('runs both check suites when the fixed comparison reaches the API file limit', async () => {
    const h = fixture()
    h.client.compareCommits.mockResolvedValue({ files: Array.from({ length: 300 }, () => ({ filename: 'docs/readme.md' })) })
    await expect(prepareValidation(h.client, h.options)).resolves.toMatchObject({ run_ci: true, run_devcontainer: true })
  })
})
