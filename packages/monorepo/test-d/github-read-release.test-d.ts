import type { GitHubOperations, GitHubRelease } from '@icebreakers/monorepo'
import { GitHubClient } from '@icebreakers/monorepo'
import { expectAssignable, expectType } from 'tsd'

const client = new GitHubClient({ repository: 'fixture/repo' })
expectType<Promise<GitHubRelease | undefined>>(client.readRelease('fixture@1.0.0'))
expectAssignable<GitHubOperations>({
  ensurePullRequest: async () => ({ number: 1, html_url: '', state: 'open' }),
  ensureRelease: async () => ({ id: 1, html_url: '', tag_name: 'fixture@1.0.0' }),
})
