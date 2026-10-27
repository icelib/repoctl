import { GitHubClient } from '@icebreakers/monorepo'
import { describe, expect, it, vi } from 'vitest'

const tag = '@fixture/core@1.0.0'
const release = { id: 12, html_url: 'https://example.test/release/12', tag_name: tag, draft: false, prerelease: false }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

function client(fetch: typeof globalThis.fetch) {
  return new GitHubClient({ token: 'fixture', repository: 'fixture/repo', fetch, retryAttempts: 1 })
}

describe('准确 tag 的只读 Release 查询', () => {
  it('使用编码后的 tag 查询且不读取分页列表', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => json(release))
    await expect(client(fetch).readRelease(tag)).resolves.toEqual(release)
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      `https://api.github.com/repos/fixture/repo/releases/tags/${encodeURIComponent(tag)}`,
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('只把 404 视为明确缺失', async () => {
    await expect(client(async () => json({ message: 'Not Found' }, 404)).readRelease(tag)).resolves.toBeUndefined()
  })

  it.each([401, 403, 429, 500, 503])('保留 HTTP %s 失败', async (status) => {
    await expect(client(async () => json({ message: 'failure' }, status)).readRelease(tag)).rejects.toMatchObject({ status })
  })

  it.each([
    null,
    [],
    {},
    { ...release, id: 0 },
    { ...release, id: 0.5 },
    { ...release, tag_name: 'other@1.0.0' },
    { ...release, draft: undefined },
    { ...release, prerelease: undefined },
    { ...release, html_url: undefined },
  ])('未知响应不得被解释为不存在：%j', async (body) => {
    await expect(client(async () => json(body)).readRelease(tag)).rejects.toThrow('invalid release response')
  })

  it('空响应及网络错误继续阻断', async () => {
    await expect(client(async () => new Response('')).readRelease(tag)).rejects.toThrow('invalid release response')
    await expect(client(async () => {
      throw new TypeError('connection failed')
    }).readRelease(tag)).rejects.toThrow()
  })
})
