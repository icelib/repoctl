import type { WorkspaceGraph, WorkspaceGraphNode } from '../../../core/workspace-graph/types'
import type { WorkspaceRemovalFile } from '../../../types/removal'
import { matchesGlob } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import path from 'pathe'
import YAML from 'yaml'
import { workspaceDependencyTypes } from '../../../core/workspace-graph/shared'
import { hash, record } from '../../deps/files'
import { movedPath } from './paths'

export function changedFile(file: string, before: string, after: string, fields: string[]): WorkspaceRemovalFile {
  return { path: file, before, after, beforeHash: hash(before), afterHash: hash(after), fields: fields.sort() }
}

export function serializeJson(before: string, value: unknown) {
  const indentation = before.match(/\n([\t ]+)"/)?.[1] ?? '  '
  const newline = before.includes('\r\n') ? '\r\n' : '\n'
  return JSON.stringify(value, null, indentation).replaceAll('\n', newline) + (before.endsWith('\n') ? newline : '')
}

function renameKey(object: Record<string, unknown>, before: string, after: string) {
  if (before === after || !Object.hasOwn(object, before)) {
    return
  }
  if (Object.hasOwn(object, after)) {
    throw new Error(`Renaming ${before} would overwrite existing key ${after}.`)
  }
  const entries = Object.entries(object).map(([key, value]) => [key === before ? after : key, value])
  Object.keys(object).forEach(key => delete object[key])
  Object.assign(object, Object.fromEntries(entries))
}

export function relativeReference(root: string, base: string, nextBase: string, value: string, from: string, to: string) {
  if (path.isAbsolute(value) || value.includes('${') || value.includes('\\')) {
    return value
  }
  const absolute = path.resolve(root, base, value)
  const next = movedPath(path.relative(root, absolute), from, to)
  const relative = path.relative(path.join(root, nextBase), path.join(root, next)) || '.'
  const result = relative.startsWith('.') ? relative : `./${relative}`
  return path.resolve(root, nextBase, value) === path.join(root, next) ? value : result
}

function dependencyValue(root: string, source: string, value: string, target: WorkspaceGraphNode, to: string, name: string | undefined) {
  const prefix = /^(workspace:|file:|link:)/u.exec(value)?.[1]
  const suffix = prefix ? value.slice(prefix.length) : ''
  if (prefix && (prefix !== 'workspace:' || suffix.startsWith('.'))) {
    return prefix + relativeReference(root, source, movedPath(source, target.id, to), suffix, target.id, to)
  }
  if (name && target.name && name !== target.name) {
    for (const protocol of ['workspace:', 'npm:']) {
      const alias = `${protocol}${target.name}@`
      if (value.startsWith(alias)) {
        return `${protocol}${name}@${value.slice(alias.length)}`
      }
    }
  }
  return value
}

export function moveManifestChanges(contents: Map<string, string>, graph: WorkspaceGraph, target: WorkspaceGraphNode, to: string, name: string | undefined, gitRoot = graph.workspaceDir) {
  const files: WorkspaceRemovalFile[] = []
  for (const node of graph.nodes) {
    const file = node.id === '.' ? 'package.json' : `${node.id}/package.json`
    const before = contents.get(file)!
    const manifest = JSON.parse(before)
    const fields: string[] = []
    const renamedDependencies = new Set<string>()
    if (node.id === target.id) {
      if (name && name !== target.name) {
        manifest.name = name
        fields.push('name')
      }
      const repository = record(manifest.repository)
      if (to !== target.id && repository && typeof repository['directory'] === 'string'
        && path.resolve(gitRoot, repository['directory']) === path.join(graph.workspaceDir, target.id)) {
        repository['directory'] = path.relative(gitRoot, path.join(graph.workspaceDir, to))
        fields.push('repository.directory')
      }
    }
    for (const section of workspaceDependencyTypes) {
      const dependencies = record(manifest[section])
      for (const [dependency, specifier] of Object.entries(dependencies ?? {})) {
        if (typeof specifier !== 'string') {
          continue
        }
        const next = dependencyValue(graph.workspaceDir, node.id, specifier, target, to, name)
        if (next !== specifier) {
          dependencies![dependency] = next
          fields.push(`${section}.${dependency}`)
        }
        const edge = graph.edges.find(edge => edge.source === node.id && edge.type === section && edge.dependency === dependency && edge.target === target.id)
        if (edge && name && target.name && dependency === target.name && name !== target.name) {
          renameKey(dependencies!, dependency, name)
          renamedDependencies.add(dependency)
          fields.push(`${section}.${dependency} → ${name}`)
        }
      }
    }
    for (const section of ['dependenciesMeta', 'peerDependenciesMeta']) {
      const metadata = record(manifest[section])
      for (const dependency of renamedDependencies) {
        if (metadata && Object.hasOwn(metadata, dependency)) {
          renameKey(metadata, dependency, name!)
          fields.push(`${section}.${dependency} → ${name}`)
        }
      }
    }
    if (fields.length) {
      files.push(changedFile(file, before, serializeJson(before, manifest), fields))
    }
  }
  return files
}

export function moveWorkspaceManifest(before: string, from: string, to: string) {
  if (from === to) {
    return undefined
  }
  const document = YAML.parseDocument(before)
  const original = document.toJS()
  if (document.errors.length || !record(original) || !Array.isArray(original.packages) || original.packages.some((item: unknown) => typeof item !== 'string')) {
    throw new Error('Moving requires a valid packages array in pnpm-workspace.yaml.')
  }
  const packages = original.packages as string[]
  if (packages.some(item => item.startsWith('!') && matchesGlob(to, item.slice(1)))) {
    throw new Error('The destination is excluded by pnpm-workspace.yaml; review its package patterns first.')
  }
  const updated = packages.map(item => item === from || item === `./${from}` ? to : item)
  if (!updated.some(item => !item.startsWith('!') && matchesGlob(to, item))) {
    updated.push(to)
  }
  if (isDeepStrictEqual(packages, updated)) {
    return undefined
  }
  const sequence = document.get('packages')
  if (!YAML.isSeq(sequence)) {
    throw new Error('Workspace package patterns must be an editable YAML sequence.')
  }
  for (let index = 0; index < packages.length; index++) {
    if (updated[index] !== packages[index]) {
      sequence.set(index, updated[index])
    }
  }
  updated.slice(packages.length).forEach(item => sequence.add(item))
  return changedFile('pnpm-workspace.yaml', before, document.toString({ lineWidth: 0 }), ['packages'])
}
