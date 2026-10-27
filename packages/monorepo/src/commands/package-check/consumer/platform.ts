import type { ConsumerApplicability, ConsumerHost, ConsumerPackageApplicability, PackedManifest } from '../types'
import { execFileSync } from 'node:child_process'
import process from 'node:process'

let actualHost: ConsumerHost | undefined

/** 仅使用当前 Node 进程和系统证据，忽略包管理器的目标平台覆盖配置。 */
export function consumerHost(): ConsumerHost {
  if (actualHost) {
    return actualHost
  }
  const host: ConsumerHost = { os: process.platform, cpu: process.arch }
  if (process.platform === 'linux') {
    const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string }, sharedObjects?: string[] } | undefined
    if (report?.header?.glibcVersionRuntime) {
      host.libc = 'glibc'
    }
    else if (report?.sharedObjects?.some(file => /ld-musl|libc\.musl/u.test(file))) {
      host.libc = 'musl'
    }
    else {
      let output = ''
      try {
        output = execFileSync('ldd', ['--version'], { encoding: 'utf8', timeout: 5_000, stdio: ['ignore', 'pipe', 'pipe'] })
      }
      catch (error) {
        const failure = error as { stdout?: unknown, stderr?: unknown }
        output = `${String(failure.stdout ?? '')}\n${String(failure.stderr ?? '')}`
      }
      if (/musl/iu.test(output)) {
        host.libc = 'musl'
      }
      else if (/glibc|gnu libc|gnu c library/iu.test(output)) {
        host.libc = 'glibc'
      }
    }
  }
  actualHost = Object.freeze(host)
  return actualHost
}

function matches(values: string[], actual: string | undefined) {
  const blocked = values.some(value => value === '!any' || (actual !== undefined && value === `!${actual}`))
  const allowed = values.filter(value => !value.startsWith('!'))
  return !blocked && (!allowed.length || allowed.includes('any') || (actual !== undefined && allowed.includes(actual)))
}

/** 正负约束分别求交；无法确定 libc 时不宣称满足任何具体 libc。 */
export function consumerApplicability(manifest: PackedManifest, host = consumerHost()): ConsumerApplicability {
  for (const field of ['os', 'cpu', 'libc'] as const) {
    const values = manifest[field]
    if (values === undefined) {
      continue
    }
    if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !value || value === '!')) {
      throw new Error(`Consumer package ${manifest.name} has invalid ${field} constraints.`)
    }
    if (!matches(values, host[field])) {
      return { status: 'not-applicable', host, reason: `${field} ${host[field] ?? 'unknown'} does not satisfy ${JSON.stringify(values)}.` }
    }
  }
  return { status: 'applicable', host }
}

/** 每个已校验产物都记录宿主适用性，供批量消费者筛选安装根节点。 */
export function consumerPackageApplicability(manifests: PackedManifest[]): ConsumerPackageApplicability[] {
  const host = consumerHost()
  return manifests.map(manifest => ({ name: String(manifest.name), version: String(manifest.version), ...consumerApplicability(manifest, host) }))
}
