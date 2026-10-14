import { Buffer } from 'node:buffer'

function repositoryParts(repository) {
  const [owner, name] = repository.split('/')
  if (!owner || !name) {
    throw new Error(`Invalid GitHub repository: ${repository}`)
  }
  return { owner, name }
}

function encodePath(path) {
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/')
}

export function createGitHubClient({ token, repository, fetchImpl = fetch }) {
  const { owner, name } = repositoryParts(repository)
  const apiBase = `https://api.github.com/repos/${owner}/${name}`
  async function request(path, options = {}) {
    const response = await fetchImpl(`${apiBase}${path}`, {
      ...options,
      headers: {
        'accept': 'application/vnd.github+json',
        'authorization': `Bearer ${token}`,
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
        ...(options.headers ?? {}),
      },
    })
    const text = await response.text()
    let body
    try {
      body = text ? JSON.parse(text) : undefined
    }
    catch {
      body = text
    }
    if (!response.ok) {
      throw new Error(`GitHub API ${response.status} ${options.method ?? 'GET'} ${path}: ${typeof body === 'string' ? body : body?.message ?? 'request failed'}`)
    }
    return body
  }
  return {
    repository,
    getPullRequest: number => request(`/pulls/${number}`),
    getPullRequestFiles: async (number) => {
      const files = []
      for (let page = 1; ; page++) {
        const pageFiles = await request(`/pulls/${number}/files?per_page=100&page=${page}`)
        files.push(...pageFiles)
        if (pageFiles.length < 100) {
          return files
        }
      }
    },
    getContent: async (path, ref) => {
      try {
        const content = await request(`/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`)
        if (Array.isArray(content) || content.encoding !== 'base64') {
          return undefined
        }
        return Buffer.from(content.content.replace(/\n/g, ''), 'base64').toString('utf8')
      }
      catch (error) {
        if (String(error.message).startsWith('GitHub API 404')) {
          return undefined
        }
        throw error
      }
    },
    getRef: ref => request(`/git/ref/${encodePath(ref)}`),
    getCommit: sha => request(`/git/commits/${sha}`),
    compareCommits: (base, head) => request(`/compare/${base}...${head}`),
    getStatus: sha => request(`/commits/${sha}/status`),
    createStatus: (sha, status) => request(`/statuses/${sha}`, { method: 'POST', body: JSON.stringify(status) }),
    createBlob: content => request('/git/blobs', { method: 'POST', body: JSON.stringify({ content, encoding: 'utf-8' }) }),
    createTree: (baseTree, tree) => request('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: baseTree, tree }) }),
    createCommit: (message, tree, parents) => request('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree, parents }) }),
    updateRef: (ref, sha) => request(`/git/refs/heads/${encodePath(ref)}`, { method: 'PATCH', body: JSON.stringify({ sha, force: false }) }),
    createComment: (number, body) => request(`/issues/${number}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
    listComments: async (number) => {
      const comments = []
      for (let page = 1; ; page++) {
        const pageComments = await request(`/issues/${number}/comments?per_page=100&page=${page}`)
        comments.push(...pageComments)
        if (pageComments.length < 100) {
          return comments
        }
      }
    },
    createBranch: async (branch, sha) => request('/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }) }),
    createPullRequest: input => request('/pulls', { method: 'POST', body: JSON.stringify(input) }),
    listReleasePullRequests: (base, headRef) => request(`/pulls?state=open&base=${encodeURIComponent(base)}&head=${encodeURIComponent(`${owner}:${headRef}`)}`),
    dispatchPrValidation: (number, ref) => request('/actions/workflows/pr-ci.yml/dispatches', { method: 'POST', body: JSON.stringify({ ref, inputs: { pr_number: String(number) } }) }),
  }
}
