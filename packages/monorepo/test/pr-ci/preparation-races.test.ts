import { expect, it } from 'vitest'
import { prepareValidation } from '../../../../.github/pr-ci/prepare.mjs'
import { baseSha, fixture, headSha, preparedSha } from './fixture'

it.each(['head', 'branch head', 'base', 'base ref', 'head ref', 'fork', 'closed', 'draft', 'conflict'])('refuses a changed %s while selecting checks', async (kind) => {
  const h = fixture()
  let branchSha = headSha
  let currentBaseSha = baseSha
  h.client.getRef.mockImplementation(async ref => ({ object: { sha: ref === 'heads/feature/fix' ? branchSha : currentBaseSha } }))
  h.client.compareCommits.mockImplementation(async () => {
    if (kind === 'head') {
      h.pr.head.sha = preparedSha
    }
    if (kind === 'branch head') {
      branchSha = preparedSha
    }
    if (kind === 'base') {
      currentBaseSha = preparedSha
    }
    if (kind === 'base ref') {
      h.pr.base.ref = 'other-base'
    }
    if (kind === 'head ref') {
      h.pr.head.ref = 'other-head'
    }
    if (kind === 'fork') {
      h.pr.head.repo.full_name = 'other/repo'
    }
    if (kind === 'closed') {
      h.pr.state = 'closed'
    }
    if (kind === 'draft') {
      h.pr.draft = true
    }
    if (kind === 'conflict') {
      h.pr.mergeable = false
    }
    return { files: [{ filename: 'packages/demo/src/index.ts' }] }
  })

  await expect(prepareValidation(h.client, h.options)).rejects.toThrow()
  expect(h.options.wait).not.toHaveBeenCalled()
  expect(h.client.createStatus).toHaveBeenCalledExactlyOnceWith(headSha, expect.objectContaining({ state: 'failure' }))
})
