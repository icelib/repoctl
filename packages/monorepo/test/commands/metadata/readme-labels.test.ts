import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { clearWorkspaceCache, init, initMetadata } from '@icebreakers/monorepo'
import MarkdownIt from 'markdown-it'
import path from 'pathe'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const names = [
  'normal-name',
  '@scope/a_b',
  'pkg-_core_',
  'pkg-__core__',
  '@_scope_/pkg',
  '@scope/_name_',
  '@scope/__name__',
  '@*scope*/name',
  '@~~scope~~/name',
]
const description = 'Use **helpers** and `Map<K, V>`; read the [guide](https://example.invalid/guide).'
const markdown = new MarkdownIt({ html: true })
let root: string
let readme: string

function linkLabel(source: string, href: string) {
  const children = markdown.parse(source, {}).flatMap(token => token.children ?? [])
  const opening = children.findIndex(token => token.type === 'link_open' && token.attrGet('href') === href)
  expect(opening).toBeGreaterThanOrEqual(0)
  const closing = children.findIndex((token, index) => index > opening && token.type === 'link_close')
  expect(closing).toBeGreaterThan(opening)
  return children.slice(opening + 1, closing)
}

beforeAll(async () => {
  clearWorkspaceCache()
  root = await realpath(await mkdtemp(path.join(tmpdir(), 'repoctl-readme-labels-')))
  const git = (...args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=', ...args], { cwd: root, encoding: 'utf8' })
  git('init', '-q')
  git('config', 'user.name', 'Repoctl Fixture')
  git('config', 'user.email', 'fixture@example.invalid')
  git('remote', 'add', 'origin', 'https://github.com/example/fixture.git')
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', private: true }))
  await writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: [packages/*]\n')
  for (const [index, name] of names.entries()) {
    const directory = path.join(root, 'packages', `fixture-${index}`)
    await mkdir(directory, { recursive: true })
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name, description, version: '1.0.0' }))
  }
  await initMetadata(root)
  readme = await readFile(path.join(root, 'README.md'), 'utf8')
}, 30_000)

afterAll(async () => {
  clearWorkspaceCache()
  await rm(root, { recursive: true, force: true })
})

describe('built init README package labels', () => {
  it.each(names.map((name, index) => ({ name, directory: `packages/fixture-${index}` })))('displays $name literally without changing its manifest or link destination', async ({ name, directory }) => {
    const label = linkLabel(readme, directory)
    expect(label.map(token => token.content).join('')).toBe(name)
    expect(label.map(token => token.type)).toEqual(['text'])
    const manifest = JSON.parse(await readFile(path.join(root, directory, 'package.json'), 'utf8'))
    expect(manifest.name).toBe(name)
    expect(manifest.description).toBe(description)
    expect(manifest.repository.directory).toBe(directory)
  })

  it('preserves Markdown formatting in descriptions', () => {
    const html = markdown.render(readme)
    expect(html).toContain('<strong>helpers</strong>')
    expect(html).toContain('<code>Map&lt;K, V&gt;</code>')
    expect(html).toContain('<a href="https://example.invalid/guide">guide</a>')
  })

  it('regenerates labels from the manifest without adding another layer of escaping', async () => {
    await initMetadata(root)
    expect(await readFile(path.join(root, 'README.md'), 'utf8')).toBe(readme)
    await init(root, { force: true })
    expect(await readFile(path.join(root, 'README.md'), 'utf8')).toBe(readme)
  })
})
