import type { DocsSiteConfig } from '../../types/docs'
import type { ReleaseCompletionRecord } from '../release/completion/types'
import { readFile } from 'node:fs/promises'
import micromatch from 'micromatch'
import path from 'pathe'
import { isIntentConsumed, parseIntent, readLedger, readPendingIntents } from '../release/intents'
import { assertSha, git, isAncestor } from './git'
import { coveredPackages } from './packages'

const excludedInputs = ['**/README*', '**/CHANGELOG*', '**/docs/**', '**/test/**', '**/tests/**', '**/__tests__/**', '**/test-d/**', '**/*.test.*', '**/*.spec.*']

export { coveredPackages } from './packages'

export async function checkReleaseCoverage(source: string, record: ReleaseCompletionRecord, site: DocsSiteConfig) {
  const packages = await coveredPackages(source, site)
  const blockers: string[] = []
  const proofs = new Map(record.packages.map(pkg => [pkg.name, pkg]))
  const ledger = await readLedger(source)
  for (const filename of await readPendingIntents(source)) {
    const entries = parseIntent(await readFile(path.join(source, filename), 'utf8'), filename)
    for (const pkg of packages) {
      const directory = path.relative(source, pkg.rootDir)
      if (entries.some(([name, bump]) => bump !== 'none' && (name === pkg.manifest.name || name.replace(/^\.\//, '') === directory))
        && !isIntentConsumed(ledger, path.basename(filename, '.md'), pkg.manifest.name!, directory)) {
        blockers.push(`Unconsumed release intent for ${pkg.manifest.name}: ${filename}`)
      }
    }
  }
  for (const pkg of packages) {
    const name = pkg.manifest.name!
    const proof = proofs.get(name)
    if (!proof || proof.version !== pkg.manifest.version) {
      blockers.push(`No completed stable publication for ${name}@${pkg.manifest.version}`)
      continue
    }
    assertSha(proof.sourceSha, `Published source for ${name}`)
    if (!isAncestor(source, proof.sourceSha, record.sourceSha)) {
      blockers.push(`Published source of ${name} is outside the release snapshot history`)
      continue
    }
    const directory = path.relative(source, pkg.rootDir)
    const patterns = site.releaseInputs?.[name] ?? [`${directory}/**`, ...excludedInputs.map(pattern => `!${pattern}`)]
    const changed = git(source, ['diff', '--name-only', '--no-renames', '-z', proof.sourceSha, record.sourceSha]).split('\0').filter(Boolean)
    const selected = new Set(micromatch(changed, patterns, { dot: true }))
    const manifest = `${directory}/package.json`
    if (changed.includes(manifest)) {
      selected.add(manifest)
    }
    if (selected.size) {
      blockers.push(`Unpublished inputs for ${name}: ${[...selected].sort().join(', ')}`)
    }
  }
  for (const name of Object.keys(site.releaseInputs ?? {})) {
    if (!packages.some(pkg => pkg.manifest.name === name)) {
      blockers.push(`releaseInputs references an uncovered package: ${name}`)
    }
  }
  return { blockers, names: packages.map(pkg => pkg.manifest.name!) }
}
