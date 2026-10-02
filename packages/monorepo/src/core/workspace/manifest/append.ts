import type { Document, Node, ToStringOptions } from 'yaml'
import type { parseWorkspaceManifest } from './parse'
import YAML from 'yaml'
import { validateWorkspaceManifestContent } from './content'

type ParsedManifest = ReturnType<typeof parseWorkspaceManifest>

function copyComments(target: Node, source: Node) {
  if (source.comment !== undefined) {
    target.comment = source.comment
  }
  if (source.commentBefore !== undefined) {
    target.commentBefore = source.commentBefore
  }
  if (source.spaceBefore !== undefined) {
    target.spaceBefore = source.spaceBefore
  }
}

function findPackagesPair(document: Document) {
  if (!YAML.isMap(document.contents)) {
    return undefined
  }
  return document.contents.items.find(({ key }) => {
    // The pnpm reader has already rejected complex keys. Resolve scalar
    // aliases as well as literal strings to locate the existing pair.
    const value = YAML.isNode(key) ? key.toJS(document) : key
    return value === 'packages'
  })
}

function appendToExistingRules(document: Document, patterns: string[], additions: string[]) {
  const pair = findPackagesPair(document)
  if (!pair) {
    throw new Error('Cannot locate pnpm-workspace.yaml packages in the YAML document.')
  }
  const current = pair.value
  if (YAML.isAlias(current)) {
    // Edit only the workspace selection, preserving the shared definition.
    const sequence = document.createNode([...patterns, ...additions])
    copyComments(sequence, current)
    pair.value = sequence
    return
  }
  if (!YAML.isSeq(current)) {
    throw new Error('pnpm-workspace.yaml packages must resolve to a YAML sequence.')
  }
  if (current.anchor) {
    // Aliases elsewhere must continue to see the original rules. Keep the
    // original sequence (and its scalar anchors/comments) in place and
    // materialize only references to this exact anchor before appending.
    YAML.visit(document, {
      Alias(_key, alias) {
        if (alias.resolve(document) !== current) {
          return
        }
        const sequence = document.createNode([...patterns])
        if (current.flow !== undefined) {
          sequence.flow = current.flow
        }
        copyComments(sequence, alias)
        return sequence
      },
    })
  }
  for (const pattern of additions) {
    current.add(document.createNode(pattern))
  }
}

/** Append rules and verify the complete output before a caller writes files. */
export function appendWorkspaceManifestPatterns(
  parsed: ParsedManifest,
  additions: string[],
  options?: ToStringOptions,
) {
  const { document, patterns, manifest } = parsed
  if (additions.length) {
    if (patterns === undefined) {
      document.set('packages', additions)
    }
    else {
      appendToExistingRules(document, patterns, additions)
    }
  }
  const expected = additions.length
    ? { ...manifest, packages: [...(patterns ?? []), ...additions] }
    : manifest
  const content = document.toString(options)
  validateWorkspaceManifestContent(content, expected)
  return content
}
