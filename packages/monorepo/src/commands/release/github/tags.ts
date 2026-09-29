import type { EnsureTagOptions, GitHubRequest } from './types'
import { ReleaseCommandError } from '../errors'
import { GitHubApiError } from './errors'

interface GitObject { sha: string, type: string }

export async function readTagTarget(request: GitHubRequest, tag: string) {
  let object: GitObject | undefined
  try {
    object = (await request<{ object: GitObject }>('GET', `/git/ref/tags/${encodeURIComponent(tag)}`)).data?.object
  }
  catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) {
      return undefined
    }
    throw error
  }
  for (let depth = 0; object?.type === 'tag' && depth < 10; depth++) {
    object = (await request<{ object: GitObject }>('GET', `/git/tags/${object.sha}`)).data?.object
  }
  if (object?.type !== 'commit') {
    throw new ReleaseCommandError(`Cannot resolve tag target for ${tag}`)
  }
  return object.sha
}

export async function ensureTag(request: GitHubRequest, options: EnsureTagOptions) {
  const verify = async () => {
    const target = await readTagTarget(request, options.tag)
    if (target === undefined) {
      return false
    }
    if (target !== options.target) {
      throw new ReleaseCommandError(`Tag target conflict for ${options.tag}: expected ${options.target}, got ${target}; refusing to move the tag`)
    }
    return true
  }
  if (await verify()) {
    return
  }
  try {
    await request('POST', '/git/refs', { ref: `refs/tags/${options.tag}`, sha: options.target })
  }
  catch (error) {
    if (!(error instanceof GitHubApiError) || ![0, 422, 429, 500, 502, 503, 504].includes(error.status)) {
      throw error
    }
    if (!await verify()) {
      throw error
    }
  }
}
