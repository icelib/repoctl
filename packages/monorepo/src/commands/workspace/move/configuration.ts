import type { WorkspaceGraphNode } from '../../../core/workspace-graph/types'
import type { WorkspaceMoveReview } from '../../../types/move'
import type { WorkspaceRemovalFile } from '../../../types/removal'
import { parse, stringify } from 'comment-json'
import path from 'pathe'
import { isWithin } from '../../clean/safety'
import { record } from '../../deps/files'
import { changedFile, relativeReference } from './manifests'
import { movedPath } from './paths'

export function moveTypeScriptConfig(root: string, file: string, before: string, target: WorkspaceGraphNode, to: string, name: string | undefined) {
  const tasks: WorkspaceMoveReview['tasks'] = []
  const fields: string[] = []
  let config: Record<string, unknown> | undefined
  try {
    config = record(parse(before))
  }
  catch {
    tasks.push({ path: file, line: 1, reason: 'TypeScript configuration could not be parsed; review its paths manually.' })
    return { tasks }
  }
  if (!config) {
    return { tasks }
  }
  const directory = path.dirname(file)
  const nextDirectory = movedPath(directory, target.id, to)
  const rewrite = (value: string, base = directory, nextBase = nextDirectory) => relativeReference(root, base, nextBase, value, target.id, to)
  const update = (object: Record<string, unknown>, key: string, prefix: string, relativeOnly = false) => {
    const value = object[key]
    const transform = (item: unknown) => typeof item === 'string' && (!relativeOnly || item.startsWith('.')) ? rewrite(item) : item
    const after = Array.isArray(value) ? value.map(transform) : transform(value)
    if (JSON.stringify(after) !== JSON.stringify(value)) {
      object[key] = after
      fields.push(prefix + key)
    }
  }
  update(config, 'extends', '', true)
  for (const key of ['files', 'include', 'exclude']) {
    const patterns = config[key]
    if (to !== target.id && Array.isArray(patterns) && patterns.some((value) => {
      if (typeof value !== 'string') {
        return false
      }
      const wildcard = [...value].findIndex(character => '*?{['.includes(character))
      if (wildcard < 0) {
        return false
      }
      const prefix = path.resolve(root, directory, value.slice(0, value.lastIndexOf('/', wildcard) + 1))
      return isWithin(prefix, path.join(root, target.id)) || isWithin(prefix, path.join(root, to))
    })) {
      tasks.push({ path: file, line: Math.max(1, before.split(/\r?\n/u).findIndex(line => line.includes(`"${key}"`)) + 1), reason: `Review ${key} glob coverage after moving; wildcard expansion is not analyzed.` })
    }
    update(config, key, '')
  }
  if (Array.isArray(config['references'])) {
    for (const [index, reference] of config['references'].entries()) {
      if (record(reference)) {
        update(reference, 'path', `references.${index}.`)
      }
    }
  }
  const options = record(config['compilerOptions'])
  if (options) {
    const base = path.relative(root, path.resolve(root, directory, typeof options['baseUrl'] === 'string' ? options['baseUrl'] : '.'))
    const nextBase = movedPath(base, target.id, to)
    for (const key of ['baseUrl', 'rootDir', 'rootDirs', 'outDir', 'declarationDir', 'typeRoots']) {
      update(options, key, 'compilerOptions.')
    }
    const aliases = record(options['paths'])
    if (aliases && config['extends'] && typeof options['baseUrl'] !== 'string') {
      tasks.push({ path: file, line: 1, reason: 'Inherited TypeScript baseUrl is not resolved; review compilerOptions.paths manually.' })
    }
    else if (aliases) {
      for (const [alias, values] of Object.entries(aliases)) {
        const nextAlias = target.name && name && (alias === target.name || alias === `${target.name}/*`) ? name + alias.slice(target.name.length) : alias
        if (nextAlias !== alias && Object.hasOwn(aliases, nextAlias)) {
          throw new Error(`TypeScript path alias already exists: ${file}: ${nextAlias}`)
        }
        const updated = Array.isArray(values) ? values.map(value => typeof value === 'string' ? rewrite(value, base, nextBase) : value) : values
        if (nextAlias !== alias || JSON.stringify(updated) !== JSON.stringify(values)) {
          if (nextAlias !== alias) {
            delete aliases[alias]
          }
          aliases[nextAlias] = updated
          fields.push(`compilerOptions.paths.${alias}`)
        }
      }
    }
  }
  const newline = before.includes('\r\n') ? '\r\n' : '\n'
  const after = stringify(config, null, before.match(/\n([\t ]+)"/)?.[1] ?? '  ').replaceAll('\n', newline) + (before.endsWith('\n') ? newline : '')
  return { tasks, file: fields.length ? changedFile(file, before, after, fields) : undefined }
}

export function moveConfigurationChanges(root: string, contents: Map<string, string>, target: WorkspaceGraphNode, to: string, name: string | undefined) {
  const files: WorkspaceRemovalFile[] = []
  const tasks: WorkspaceMoveReview['tasks'] = []
  for (const [file, before] of contents) {
    if (!/^tsconfig(?:[.-].*)?\.json$/u.test(path.basename(file))) {
      continue
    }
    const result = moveTypeScriptConfig(root, file, before, target, to, name)
    if (result.file) {
      files.push(result.file)
    }
    tasks.push(...result.tasks)
  }
  return { files, tasks }
}
