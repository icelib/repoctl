import type { AutoChangesetGitHub } from './github/client'
import type { ChangedFile, GitTree } from './github/tree'
import type { MetadataPackage } from './workspace'
import { parseIntent } from '../intents'
import { readBlob } from './github/tree'

export async function manualIntents(client: AutoChangesetGitHub, files: ChangedFile[], tree: GitTree, packages: MetadataPackage[], ownPath: string) {
  const manual: string[] = []
  for (const file of files) {
    if (!/^\.changeset\/[^/]+\.md$/u.test(file.filename) || file.filename === ownPath
      || file.filename.toLowerCase() === '.changeset/readme.md' || file.status === 'removed' || file.status === 'unchanged') {
      continue
    }
    const entry = tree.entries.get(file.filename)
    if (!entry) {
      throw new Error(`Changed intent is missing from the head tree: ${file.filename}.`)
    }
    const intent = parseIntent(await readBlob(client, entry), file.filename)
    for (const [name] of intent) {
      if (!packages.some(pkg => pkg.name === name || pkg.directory === name.replace(/^\.\//u, ''))) {
        throw new Error(`Unknown package in handwritten intent: ${name}.`)
      }
    }
    manual.push(file.filename)
  }
  return manual
}
