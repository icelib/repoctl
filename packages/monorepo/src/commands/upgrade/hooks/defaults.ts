import { createHash } from 'node:crypto'

// Fingerprint of the factory shipped in the legacy default repoctl.config.ts.
// Trim indentation only: command strings and shell quoting must match exactly.
const factoryHash = '8fc345beb5481e70f47f5dadf18f8afdb5ff3550d8f2677128aecac814c06680'
const factoryPattern = /^function createLintStagedConfig\(monorepoCommand: string\) \{[\s\S]+?^\}/mu
const callPattern = /\blintStaged\s*:\s*\{\s*config\s*:\s*createLintStagedConfig\(['"]pnpm exec repoctl['"]\)\s*(?:,\s*)?\}\s*,?/u

export function removeDefaultStagedFactory(content: string) {
  const factory = content.match(factoryPattern)?.[0]
  if (!factory) {
    return content
  }
  const normalized = factory.split(/\r?\n/u).map(line => line.trim()).join('\n')
  if (createHash('sha256').update(normalized).digest('hex') !== factoryHash) {
    return content
  }
  const withoutCall = content.replace(callPattern, '')
  const migrated = withoutCall.replace(factory, '')
  return withoutCall !== content && !/\bcreateLintStagedConfig\b/u.test(migrated) ? migrated : content
}
