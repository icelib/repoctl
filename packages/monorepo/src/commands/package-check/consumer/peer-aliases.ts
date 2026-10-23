import { maxSatisfying, valid, validRange } from 'semver'
import { dependencyReferences } from '../dependencies'

/** pnpm 12 cannot install npm aliases whose range contains AND comparators. */
export async function resolveConsumerPeerAliases(dependencies: Record<string, string>, query: (specifier: string) => Promise<string>): Promise<Record<string, string>> {
  const resolved = { ...dependencies }
  for (const reference of dependencyReferences({ dependencies }, '.')) {
    const { alias, name, range } = reference
    if (!dependencies[alias]!.startsWith('npm:') || !validRange(range) || range.split('||').every(alternative => !/\s/u.test(alternative.trim()))) {
      continue
    }
    const output = await query(`${name}@${range}`)
    let response: unknown
    try {
      response = JSON.parse(output)
    }
    catch {
      throw new Error(`Consumer optional peer ${alias} received an invalid registry version response.`)
    }
    const versions = typeof response === 'string' ? [response] : response
    if (!Array.isArray(versions) || !versions.every(version => typeof version === 'string' && valid(version))) {
      throw new Error(`Consumer optional peer ${alias} received an invalid registry version response.`)
    }
    const version = maxSatisfying(versions as string[], range)
    if (!version) {
      throw new Error(`Consumer optional peer ${alias} has no published version matching ${range}.`)
    }
    resolved[alias] = `npm:${name}@${version}`
  }
  return resolved
}
