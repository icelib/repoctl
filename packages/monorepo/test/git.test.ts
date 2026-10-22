import CI from 'ci-info'
import gitUrlParse from 'git-url-parse'
import { vi } from 'vitest'
import { logger } from '@/core/logger'
// eslint-disable-next-line antfu/no-import-dist -- Exercise the shipped Git metadata API.
import { GitClient } from '../dist/index.mjs'

describe('git client', () => {
  const client = new GitClient({
    baseDir: __dirname,
  })
  it('client config', async () => {
    const listConfig = await client.listConfig()
    const x = listConfig.all['remote.origin.url']
    if (typeof x === 'string') {
      const url = gitUrlParse(x)
      const y = `${url.owner}/${url.name}`
      logger.log(y)
    }
  })

  it('parse url', () => {
    const url = gitUrlParse('git@github.com:sonofmagic/weapp-tailwindcss.git')
    const y = `${url.owner}/${url.name}`
    expect(y).toBe('sonofmagic/weapp-tailwindcss')
  })

  it('getRepoName returns undefined when origin is missing', async () => {
    const spy = vi.spyOn(client, 'getConfig').mockResolvedValue({})
    expect(await client.getRepoName()).toBeUndefined()
    spy.mockRestore()
  })

  it('getRepoName resolves owner/name when remote exists', async () => {
    const spy = vi.spyOn(client, 'getConfig').mockResolvedValue({
      'remote.origin.url': 'git@github.com:ice/awesome.git',
    })
    expect(await client.getRepoName()).toBe('ice/awesome')
    spy.mockRestore()
  })

  it('preserves parsed URL fields and protocol formatting through the public entrypoint', async () => {
    const spy = vi.spyOn(client, 'getConfig').mockResolvedValue({
      'remote.origin.url': 'https://github.com/ice/awesome/blob/main/src/index.ts?plain=1#L5',
    })
    try {
      const metadata = await client.getGitUrl()
      expect(metadata).toMatchObject({
        source: 'github.com',
        resource: 'github.com',
        owner: 'ice',
        name: 'awesome',
        full_name: 'ice/awesome',
        ref: 'main',
        filepath: 'src/index.ts',
        filepathtype: 'blob',
        protocol: 'https',
        protocols: ['https'],
        query: { plain: '1' },
        hash: 'L5',
      })
      expect(metadata?.toString('ssh')).toBe('git@github.com:ice/awesome')
    }
    finally {
      spy.mockRestore()
    }
  })

  it.skipIf(CI.isCI)('getUser', async () => {
    const user = await client.getUser()
    expect(user).toBeTruthy()
    expect(user.email).toBeTruthy()
    expect(user.name).toBeTruthy()
    logger.log('[Git getUser]', user)
  })
})
