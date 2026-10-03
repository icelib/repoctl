import type { TemplateInstanceSource } from './types'

/** Registry identities contain reproducible public coordinates, never authentication settings. */
export function validateRemoteInstanceSource(source: TemplateInstanceSource, exactVersion: RegExp) {
  const remote = source.remote
  if (source.kind !== 'remote') {
    if (remote !== undefined) {
      throw new Error('Only remote template sources can contain remote coordinates.')
    }
    return
  }
  if (!remote || !/^[a-f0-9]{64}$/u.test(source.digest ?? '') || typeof remote.integrity !== 'string' || !/^(?:sha512|sha384|sha256|sha1)-[A-Za-z0-9+/]+={0,2}(?:\s+(?:sha512|sha384|sha256|sha1)-[A-Za-z0-9+/]+={0,2})*$/u.test(remote.integrity)) {
    throw new Error('Remote template identity needs content digest and archive integrity.')
  }
  const fields = remote.kind === 'npm' ? ['kind', 'packageName', 'requestedVersion', 'version', 'registry', 'integrity'] : ['kind', 'repository', 'requestedRef', 'commit', 'integrity']
  if (Object.keys(remote).some(field => !fields.includes(field))) {
    throw new Error('Remote template identity contains unsupported metadata.')
  }
  try {
    if (remote.kind === 'npm') {
      const registry = new URL(remote.registry)
      if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/u.test(remote.packageName) || !exactVersion.test(remote.version) || remote.requestedVersion !== remote.version || !['https:', 'http:'].includes(registry.protocol) || registry.username || registry.password || registry.search || registry.hash) {
        throw new Error('Invalid npm identity.')
      }
      return
    }
    if (remote.kind === 'git') {
      const repository = new URL(remote.repository)
      if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(remote.commit) || !remote.requestedRef || /\s/u.test(remote.requestedRef) || !['https:', 'ssh:', 'file:'].includes(repository.protocol) || repository.password || (repository.username && !(repository.protocol === 'ssh:' && repository.username === 'git')) || repository.search || repository.hash) {
        throw new Error('Invalid Git identity.')
      }
      return
    }
  }
  catch {
    throw new Error('Remote template coordinates must identify an exact version or commit without credentials.')
  }
  throw new Error('Unknown remote template identity kind.')
}
