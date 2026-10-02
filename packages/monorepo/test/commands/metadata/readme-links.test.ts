import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { clearWorkspaceCache, init, initMetadata } from '@icebreakers/monorepo'
import MarkdownIt from 'markdown-it'
import path from 'pathe'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const directories = [
  'plain',
  'space dir',
  'hash#part',
  'closing)paren',
  'opening(paren',
  'balanced(paren)',
  'literal%23',
  '中文',
  'nested space/child#part',
  'apostrophe\'and!bang',
]
if (process.platform !== 'win32') {
  directories.push('query?part')
}

const markdown = new MarkdownIt()
let root: string
let readme: string
let links: Map<string, string>

function packageLinks(source: string) {
  const result = new Map<string, string>()
  for (const token of markdown.parse(source, {})) {
    const children = token.children ?? []
    for (const [index, child] of children.entries()) {
      if (child.type === 'link_open') {
        const href = child.attrGet('href')
        const label = children[index + 1]?.content
        if (href && label) {
          result.set(label, href)
        }
      }
    }
  }
  return result
}

async function writePackage(directory: string, name: string) {
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0' }))
}

function expectDestination(href: string | undefined, pathname: string) {
  expect(href).toBeDefined()
  const url = new URL(href!, 'https://example.invalid/repository/')
  expect(decodeURIComponent(url.pathname)).toBe(pathname)
  expect(url.hash).toBe('')
  expect(url.search).toBe('')
}

beforeAll(async () => {
  clearWorkspaceCache()
  root = await realpath(await mkdtemp(path.join(tmpdir(), 'repoctl-readme-links-')))
  const git = (...args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=', ...args], { cwd: root, encoding: 'utf8' })
  git('init', '-q')
  git('config', 'user.name', 'Repoctl Fixture')
  git('config', 'user.email', 'fixture@example.invalid')
  git('remote', 'add', 'origin', 'https://github.com/example/fixture.git')
  await writePackage(root, 'fixture')
  await writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: [modules/**]\n')
  for (const [index, directory] of directories.entries()) {
    await writePackage(path.join(root, 'modules', directory), `fixture-${index}`)
  }
  await initMetadata(root)
  readme = await readFile(path.join(root, 'README.md'), 'utf8')
  links = packageLinks(readme)
}, 30_000)

afterAll(async () => {
  clearWorkspaceCache()
  await rm(root, { recursive: true, force: true })
})

describe('built init README link destinations', () => {
  it.each(directories.map((directory, index) => ({ directory, name: `fixture-${index}` })))('links to the literal directory $directory', async ({ directory, name }) => {
    expectDestination(links.get(name), `/repository/modules/${directory}`)
    const manifest = JSON.parse(await readFile(path.join(root, 'modules', directory, 'package.json'), 'utf8'))
    expect(manifest.repository.directory).toBe(`modules/${directory}`)
  })

  it('keeps parent segments when the workspace includes a sibling directory', async () => {
    const workspace = path.join(root, 'parent-case/nested')
    await writePackage(workspace, 'nested-fixture')
    await writePackage(path.join(root, 'parent-case/shared/space #dir'), 'sibling')
    await writeFile(path.join(workspace, 'pnpm-workspace.yaml'), 'packages: [../shared/*]\n')

    await initMetadata(workspace)

    const source = await readFile(path.join(workspace, 'README.md'), 'utf8')
    expectDestination(packageLinks(source).get('sibling'), '/shared/space #dir')
    expect(packageLinks(source).get('sibling')).toMatch(/^\.\.\/shared\//)
  })

  it('preserves user READMEs and produces the same links when explicitly regenerated', async () => {
    const readmePath = path.join(root, 'README.md')
    await initMetadata(root)
    expect(await readFile(readmePath, 'utf8')).toBe(readme)
    const userContent = '# User README\n'
    await writeFile(readmePath, userContent)
    await initMetadata(root)
    expect(await readFile(readmePath, 'utf8')).toBe(userContent)

    await init(root, { force: true })

    expect(await readFile(readmePath, 'utf8')).toBe(readme)
    expect(packageLinks(await readFile(readmePath, 'utf8'))).toEqual(links)
  })
})
