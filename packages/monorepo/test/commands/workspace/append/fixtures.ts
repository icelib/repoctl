import { lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { clearWorkspaceCache } from '@icebreakers/monorepo'
import { afterEach, expect } from 'vitest'

const roots: string[] = []
export const defaults = ['apps/*', 'packages/*', 'examples/*']

export const appendCases = [
  {
    name: 'a packages sequence anchor referenced by other fields',
    source: 'packages: &rules [modules/*] # workspace rules\nmetadata: { rules: *rules } # metadata rules\notherRules: *rules # another reference\n',
  },
  {
    name: 'a sequence anchor redefined after references to the packages rules',
    source: 'packages: &rules [modules/*] # workspace rules\nbeforeShadow: *rules # original selection\nshadow: &rules [other/*] # independent selection\nafterShadow: *rules # shadow selection\nmetadata: { rules: *rules } # final shadow use\n',
  },
  {
    name: 'an alias used as the packages mapping key',
    source: 'workspaceKey: &key packages # mapping key\n*key : [modules/*] # workspace rules\nmetadata: { enabled: on } # user metadata\n',
  },
  {
    name: 'aliases used as both the packages key and its value',
    source: 'workspaceKey: &key packages # mapping key\nrules: &rules [modules/*] # shared rules\n*key : *rules # workspace selection\nmetadata: { key: *key, rules: *rules } # other uses\n',
  },
  {
    name: 'an alias key with an anchored packages value',
    source: 'workspaceKey: &key packages # mapping key\n*key : &rules [modules/*] # workspace rules\nmetadata: { key: *key, rules: *rules } # other uses\n',
  },
  {
    name: 'package anchors reused as metadata keys and values',
    source: 'packages: &rules [&entry modules/*] # workspace rules\nmetadata:\n  *entry : *rules # key and value references\noriginalPattern: *entry # scalar reference\n',
  },
  {
    name: 'a scalar package entry anchor referenced elsewhere',
    source: 'packages:\n  - &entry modules/* # shared entry\nmetadata: { pattern: *entry } # scalar reference\n',
  },
]

export const noOpCases = [
  {
    name: 'an anchored complete package sequence',
    source: '# Keep exact formatting\npackages: &rules [apps/*, packages/*, examples/*] # complete rules\nmetadata: { rules: *rules }\n',
  },
  {
    name: 'an alias mapping key with complete rules',
    source: '# Keep exact formatting\nworkspaceKey: &key packages\n*key : [apps/*, packages/*, examples/*] # complete rules\nmetadata: { key: *key }\n',
  },
  {
    name: 'alias mapping keys and values with complete rules',
    source: '# Keep exact formatting\nworkspaceKey: &key packages\nrules: &rules [apps/*, packages/*, examples/*]\n*key : *rules # complete rules\nmetadata: { key: *key, rules: *rules }\n',
  },
]

export function registerFixtureCleanup() {
  afterEach(async () => {
    clearWorkspaceCache()
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
  })
}

async function outputFile(root: string, relativePath: string, source: string) {
  const filename = path.join(root, relativePath)
  await mkdir(path.dirname(filename), { recursive: true })
  await writeFile(filename, source)
}

export async function createWorkspace(source: string) {
  const root = await mkdtemp(path.join(tmpdir(), 'repoctl-workspace-append-'))
  roots.push(root)
  await outputFile(root, 'package.json', JSON.stringify({ name: 'fixture-root', private: true }))
  await outputFile(root, 'pnpm-workspace.yaml', source)
  await outputFile(root, 'modules/api/package.json', JSON.stringify({ name: 'fixture-api', version: '1.0.0' }))
  await outputFile(root, 'user/notes.txt', 'keep user notes\n')
  return root
}

export async function readManifestContent(root: string) {
  return readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8')
}

export async function expectCommentsPreserved(root: string, original: string) {
  const content = await readManifestContent(root)
  for (const comment of original.match(/#[^\n]*/g) ?? []) {
    expect(content).toContain(comment)
  }
}

export async function snapshotWorkspace(root: string) {
  const entries: Record<string, string> = {}
  async function visit(relative: string) {
    for (const name of (await readdir(path.join(root, relative))).sort()) {
      const key = relative ? `${relative}/${name}` : name
      const absolute = path.join(root, key)
      const stat = await lstat(absolute)
      if (stat.isDirectory()) {
        entries[`${key}/`] = `directory:${stat.mode}`
        await visit(key)
      }
      else {
        entries[key] = `${stat.mode}:${(await readFile(absolute)).toString('base64')}`
      }
    }
  }
  await visit('')
  return entries
}
