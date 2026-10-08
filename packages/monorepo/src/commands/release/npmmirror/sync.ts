import type { PackageMetadata, SyncContext, SyncResult, SyncTarget } from './types'
import { valid } from 'semver'
import { MirrorHttpError, mirrorRegistry, pause, requestJson, sourceRegistry, taskEndpoint } from './http'

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function metadata(registry: string, name: string, context: SyncContext): Promise<PackageMetadata> {
  const value = await requestJson(`${registry}/${encodeURIComponent(name)}`, context)
  if (!object(value) || !object(value['versions']) || !object(value['dist-tags'])
    || Object.values(value['dist-tags']).some(version => typeof version !== 'string')) {
    throw new Error(`Invalid npm metadata for ${name}`)
  }
  return { 'versions': value['versions'], 'dist-tags': value['dist-tags'] as Record<string, string> }
}

function parseTask(value: unknown): { id: string, state: string } {
  if (!object(value) || value['ok'] !== true || typeof value['id'] !== 'string' || !value['id']
    || !['waiting', 'processing', 'success', 'error'].includes(String(value['state']))) {
    throw new Error('Invalid npmmirror sync task response')
  }
  if (value['state'] === 'error') {
    throw new Error(`npmmirror task failed: ${String(value['error'] ?? value['id'])}`)
  }
  return { id: value['id'], state: String(value['state']) }
}

export async function syncTarget(target: SyncTarget, context: SyncContext, dryRun: boolean, result: SyncResult) {
  let upstream = await metadata(sourceRegistry, target.name, context)
  const versions = target.versions.length ? target.versions : [...new Set(Object.values(upstream['dist-tags']))]
  if (!versions.length || versions.some(version => valid(version) !== version || !Object.hasOwn(upstream.versions, version))) {
    throw new Error(`Requested versions are not published on npm: ${target.name}@${versions.join(', ')}`)
  }
  result.versions = versions
  if (dryRun) {
    result.state = 'dry-run'
    return
  }

  const endpoint = taskEndpoint(target.name)
  const created = await requestJson(endpoint, context, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ skipDependencies: true, specificVersions: JSON.stringify(versions) }),
  })
  if (object(created) && typeof created['id'] === 'string') {
    result.taskId = created['id']
  }
  let task = parseTask(created)
  while (true) {
    if (task.state === 'success') {
      upstream = await metadata(sourceRegistry, target.name, context)
      let mirror: PackageMetadata | undefined
      try {
        mirror = await metadata(mirrorRegistry, target.name, context)
      }
      catch (error) {
        if (!(error instanceof MirrorHttpError && error.status === 404)) {
          throw error
        }
      }
      // tag 以 npm 当前指向为准，避免并发的新发布让旧快照永久无法通过。
      const tags = Object.entries(upstream['dist-tags']).filter(([, version]) => versions.includes(version))
      if (mirror && versions.every(version => Object.hasOwn(mirror.versions, version))
        && tags.every(([tag, version]) => mirror['dist-tags'][tag] === version)) {
        result.state = 'success'
        return
      }
    }
    await pause(context, 10_000)
    if (task.state !== 'success') {
      task = parseTask(await requestJson(`${endpoint}/${encodeURIComponent(task.id)}`, context))
    }
  }
}
