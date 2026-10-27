import { describe, expect, it } from 'vitest'
import { prepareValidation } from '../../../../.github/pr-ci/prepare.mjs'
import { baseSha, fixture, headSha, mergeSha, preparedSha } from './fixture'

describe('approved native PR preparation', () => {
  it('freezes the approved event commits without writing changesets, comments, or statuses', async () => {
    const h = fixture()
    await expect(prepareValidation(h.client, h.options)).resolves.toMatchObject({
      pr_number: 42,
      head_sha: headSha,
      base_sha: baseSha,
      base_ref: 'main',
      head_ref: 'feature/fix',
      head_repository: 'acme/repo',
      release_labels: '[]',
      merge_sha: mergeSha,
      run_ci: true,
      run_devcontainer: false,
    })
    expect(h.client.compareCommits).toHaveBeenCalledWith(baseSha, headSha)
    for (const write of [h.client.createStatus, h.client.createCommit, h.client.updateRef, h.client.createComment]) {
      expect(write).not.toHaveBeenCalled()
    }
    expect(h.client.getStatus).not.toHaveBeenCalled()
  })

  it.each(['head', 'base', 'base ref', 'head ref', 'repository', 'merge'])('rejects an outdated event %s before selecting checks', async (kind) => {
    const h = fixture()
    if (kind === 'head') {
      h.options.expectedHeadSha = preparedSha
    }
    if (kind === 'base') {
      h.options.expectedBaseSha = preparedSha
    }
    if (kind === 'base ref') {
      h.options.expectedBaseRef = 'other-base'
    }
    if (kind === 'head ref') {
      h.options.expectedHeadRef = 'other-head'
    }
    if (kind === 'repository') {
      h.options.expectedHeadRepository = 'other/repo'
    }
    if (kind === 'merge') {
      h.options.expectedMergeSha = preparedSha
      h.client.getCommit.mockResolvedValue({ parents: [{ sha: baseSha }, { sha: preparedSha }] })
    }
    await expect(prepareValidation(h.client, h.options)).rejects.toThrow()
    expect(h.client.compareCommits).not.toHaveBeenCalled()
    expect(h.client.createStatus).not.toHaveBeenCalled()
  })

  it('waits for GitHub to publish merge parents when manual preparation has no event candidate', async () => {
    const h = fixture()
    const { expectedMergeSha: _eventCandidate, ...options } = h.options
    h.client.getCommit.mockResolvedValueOnce({ parents: [{ sha: baseSha }, { sha: preparedSha }] })
    await expect(prepareValidation(h.client, options)).resolves.toHaveProperty('merge_sha', mergeSha)
    expect(h.options.wait).toHaveBeenCalledOnce()
  })

  it('rejects an old label approval even when the event commit is unchanged', async () => {
    const h = fixture()
    h.pr.labels = [{ name: 'release:minor' }]
    await expect(prepareValidation(h.client, h.options)).rejects.toThrow()
    expect(h.client.compareCommits).not.toHaveBeenCalled()
  })

  it.each([
    ['expectedHeadSha', 'head.sha', preparedSha, headSha],
    ['expectedBaseSha', 'base.sha', preparedSha, baseSha],
    ['expectedBaseRef', 'base.ref', 'other-base', 'main'],
    ['expectedHeadRef', 'head.ref', 'other-head', 'feature/fix'],
    ['expectedHeadRepository', 'head.repo.full_name', 'other/repo', 'acme/repo'],
    ['expectedReleaseLabels', 'releaseLabels', ['release:minor'], []],
  ] as const)('诊断过期事件字段 %s，并保留审批阻断', async (option, field, expected, current) => {
    const h = fixture()
    Object.assign(h.options, { [option]: expected })
    await expect(prepareValidation(h.client, h.options)).rejects.toThrow(`Event snapshot mismatches: ${JSON.stringify([{ field, expected, current }])}`)
    expect(h.client.getCommit).not.toHaveBeenCalled()
    expect(h.client.compareCommits).not.toHaveBeenCalled()
    for (const write of [h.client.createStatus, h.client.createCommit, h.client.updateRef, h.client.createComment]) {
      expect(write).not.toHaveBeenCalled()
    }
  })

  it('同时报告安全身份字段的差异，不输出 PR 的其他内容', async () => {
    const h = fixture()
    h.options.expectedHeadSha = preparedSha
    h.pr.labels = [{ name: 'release:minor' }, { name: 'bug' }, { name: 'release:major' }]
    Object.assign(h.pr, { body: 'private PR body must not be logged' })
    let message = ''
    try {
      await prepareValidation(h.client, h.options)
    }
    catch (error) {
      message = String(error)
    }
    expect(message).toContain('approve the latest run.')
    expect(message).toContain(`Event snapshot mismatches: ${JSON.stringify([
      { field: 'head.sha', expected: preparedSha, current: headSha },
      { field: 'releaseLabels', expected: [], current: ['release:major', 'release:minor'] },
    ])}`)
    expect(message).not.toContain('private PR body')
    expect(message).not.toContain('bug')
    expect(h.client.compareCommits).not.toHaveBeenCalled()
  })

  it('freezes sorted release labels while ignoring ordinary labels', async () => {
    const h = fixture()
    h.pr.labels = [{ name: 'bug' }, { name: 'release:minor' }, { name: 'release:major' }]
    h.options.expectedReleaseLabels = ['release:major', 'release:minor']
    await expect(prepareValidation(h.client, h.options)).resolves.toHaveProperty('release_labels', '["release:major","release:minor"]')
  })

  it.each(['head', 'base'])('rejects a live %s push when PR metadata is stale', async (kind) => {
    const h = fixture()
    h.client.getRef.mockImplementation(async ref => ({ object: { sha: ref === 'heads/feature/fix'
      ? kind === 'head' ? preparedSha : headSha
      : kind === 'base' ? preparedSha : baseSha } }))
    await expect(prepareValidation(h.client, h.options)).rejects.toThrow()
    expect(h.options.wait).not.toHaveBeenCalled()
    expect(h.client.compareCommits).not.toHaveBeenCalled()
  })

  it.each(['draft', 'closed', 'conflicting'])('rejects a %s PR without any writes', async (kind) => {
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
    await expect(prepareValidation(h.client, h.options)).rejects.toThrow()
    expect(h.client.getCommit).not.toHaveBeenCalled()
    expect(h.client.createStatus).not.toHaveBeenCalled()
  })

  it('prepares an existing fork intent with an authoritative head ref from its repository', async () => {
    const h = fixture()
    h.pr.head.repo.full_name = 'contributor/repo'
    h.options.expectedHeadRepository = 'contributor/repo'
    await expect(prepareValidation(h.client, h.options)).resolves.toHaveProperty('head_sha', headSha)
    expect(h.client.getRef).toHaveBeenCalledWith('heads/feature/fix', 'contributor/repo')
    expect(h.client.createComment).not.toHaveBeenCalled()
  })

  it('rejects a fork push that is hidden by stale PR metadata', async () => {
    const h = fixture()
    h.pr.head.repo.full_name = 'contributor/repo'
    h.options.expectedHeadRepository = 'contributor/repo'
    h.client.getRef.mockImplementation(async (ref, repository) => ({ object: {
      sha: repository === 'contributor/repo' && ref === 'heads/feature/fix' ? preparedSha : baseSha,
    } }))
    await expect(prepareValidation(h.client, h.options)).rejects.toThrow()
    expect(h.options.wait).not.toHaveBeenCalled()
  })

  it('bounds the wait for an unavailable merge candidate', async () => {
    const h = fixture()
    h.pr.mergeable = null
    await expect(prepareValidation(h.client, h.options)).rejects.toThrow('did not provide a current')
    expect(h.options.wait).toHaveBeenCalledTimes(11)
    expect(h.client.createStatus).not.toHaveBeenCalled()
  })

  it.each([
    { parents: [{ sha: headSha }, { sha: baseSha }] },
    { parents: [{ sha: baseSha }] },
    { parents: [{ sha: baseSha }, { sha: preparedSha }] },
  ])('does not accept a candidate with different merge parents: %j', async (commit) => {
    const h = fixture()
    h.client.getCommit.mockResolvedValue(commit)
    await expect(prepareValidation(h.client, h.options)).rejects.toThrow()
    expect(h.client.compareCommits).not.toHaveBeenCalled()
  })

  it('runs both suites when the fixed comparison reaches the API file limit', async () => {
    const h = fixture()
    h.client.compareCommits.mockResolvedValue({ files: Array.from({ length: 300 }, () => ({ filename: 'docs/readme.md' })) })
    await expect(prepareValidation(h.client, h.options)).resolves.toMatchObject({ run_ci: true, run_devcontainer: true })
  })
})
