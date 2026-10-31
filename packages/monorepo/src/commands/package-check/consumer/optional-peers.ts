import type { ConsumerRuntimeClosure } from './runtime-closure'
import { minVersion, satisfies, subset, validRange } from 'semver'

/** 显式安装可选集成和本批次必需 peer，避免包管理器使用 registry 旧包。 */
export function consumerOptionalPeers(closure: ConsumerRuntimeClosure, localLocators?: ReadonlyMap<string, string>): Record<string, string> {
  const peers = new Map<string, { names: Set<string>, ranges: string[], optional: boolean, registry: boolean }>()
  for (const { manifest, reference, name } of closure.references) {
    if (reference.field !== 'peerDependencies') {
      continue
    }
    const peer = peers.get(reference.alias) ?? { names: new Set<string>(), ranges: [], optional: false, registry: true }
    peer.names.add(name)
    peer.ranges.push(reference.range)
    peer.registry &&= reference.protocol === 'registry'
    peer.optional ||= manifest.peerDependenciesMeta?.[reference.alias]?.optional === true
    peers.set(reference.alias, peer)
  }
  return Object.fromEntries([...peers].filter(([, peer]) => peer.optional || [...peer.names].some(name => closure.known.has(name))).sort(([left], [right]) => left.localeCompare(right)).map(([alias, peer]) => {
    if (peer.names.size !== 1) {
      throw new Error(`Consumer peer alias ${alias} has conflicting package names.`)
    }
    const name = [...peer.names][0]!
    if (!peer.registry) {
      throw new Error(`Consumer peer ${alias} must declare a registry version range.`)
    }
    let alternatives = ['']
    for (const range of peer.ranges) {
      const normalized = validRange(range)
      if (!normalized) {
        throw new Error(`Consumer peer ${alias} must declare a registry version range: ${range}.`)
      }
      alternatives = alternatives.flatMap(left => normalized.split('||').map(right => `${left} ${right}`.trim())).filter(range => minVersion(range) !== null)
    }
    const intersection = [...new Set(alternatives)].join(' || ')
    if (!intersection) {
      throw new Error(`Consumer peer ${alias} has incompatible declared ranges: ${peer.ranges.join(', ')}.`)
    }
    // An original constraint contained in every other constraint is the full
    // intersection. Preserve its caret/OR notation instead of expanding it.
    const range = (peer.ranges.find(candidate => peer.ranges.every(other => subset(candidate, other))) ?? intersection).trim().replace(/([<>=~^])\s+/gu, '$1')
    const local = closure.known.get(name)
    if (local) {
      if (!local.version || !satisfies(local.version, range)) {
        throw new Error(`Consumer peer ${alias} does not accept checked workspace package ${name}@${local.version}: ${range}.`)
      }
      if (localLocators) {
        const locator = localLocators.get(name)
        if (!locator) {
          throw new Error(`Consumer peer ${alias} has no checked tarball for ${name}.`)
        }
        return [alias, locator]
      }
      return [alias, alias === name ? local.version : `npm:${name}@${local.version}`]
    }
    return [alias, alias === name ? range : `npm:${name}@${range}`]
  }))
}
