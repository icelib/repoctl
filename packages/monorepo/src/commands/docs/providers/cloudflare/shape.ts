import { isRecord } from '../../../../core/config/validation/schema'
import { DocsDiagnosticError } from '../../diagnostics'

const common = new Set(['name', 'account_id', 'compatibility_date', 'compatibility_flags', 'workers_dev', 'preview_urls', 'assets', 'route', 'routes', 'observability'])

export function unsupported(field: string): never {
  throw new DocsDiagnosticError(field === 'generated Wrangler configuration' ? 'generated-config' : field === 'named environment must declare its own routes' ? 'environment-routes-missing' : 'unsupported-config')
}

export function staticFields(value: unknown, root = false): Record<string, unknown> {
  if (!isRecord(value)) {
    return unsupported('object required')
  }
  for (const [key, item] of Object.entries(value)) {
    if (item === null) {
      unsupported(key)
    }
    if (!common.has(key) && !(root && ['$schema', 'env'].includes(key))) {
      unsupported(key)
    }
    if (['name', 'account_id', '$schema'].includes(key) && (typeof item !== 'string' || !item.trim())) {
      unsupported(key)
    }
    if (['workers_dev', 'preview_urls'].includes(key) && typeof item !== 'boolean') {
      unsupported(key)
    }
    if (key === 'compatibility_date' && (typeof item !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item) || !Number.isFinite(Date.parse(item)) || new Date(item).toISOString().slice(0, 10) !== item)) {
      unsupported(key)
    }
    if (key === 'compatibility_flags' && (!Array.isArray(item) || item.some(flag => typeof flag !== 'string' || !flag.trim()))) {
      unsupported(key)
    }
    if (key === 'env' && !isRecord(item)) {
      unsupported(key)
    }
    if (key === 'observability') {
      if (!isRecord(item) || Object.keys(item).some(field => !['enabled', 'head_sampling_rate'].includes(field))
        || (item['enabled'] !== undefined && typeof item['enabled'] !== 'boolean')
        || (item['head_sampling_rate'] !== undefined && (typeof item['head_sampling_rate'] !== 'number' || !Number.isFinite(item['head_sampling_rate']) || item['head_sampling_rate'] < 0 || item['head_sampling_rate'] > 1))) {
        unsupported(key)
      }
    }
  }
  return value
}

export function assetDirectory(value: unknown): string {
  if (!isRecord(value) || Object.keys(value).some(key => !['directory', 'html_handling', 'not_found_handling'].includes(key))
    || typeof value['directory'] !== 'string' || !value['directory']
    || (value['html_handling'] !== undefined && (typeof value['html_handling'] !== 'string' || !['auto-trailing-slash', 'force-trailing-slash', 'drop-trailing-slash', 'none'].includes(value['html_handling'])))
    || (value['not_found_handling'] !== undefined && (typeof value['not_found_handling'] !== 'string' || !['none', '404-page', 'single-page-application'].includes(value['not_found_handling'])))) {
    return unsupported('assets')
  }
  return value['directory']
}

export function customDomains(config: Record<string, unknown>): string[] {
  if (config['route'] !== undefined && config['routes'] !== undefined) {
    return unsupported('route and routes')
  }
  const routes = config['routes'] ?? (config['route'] === undefined ? [] : [config['route']])
  if (!Array.isArray(routes)) {
    return unsupported('routes')
  }
  return routes.map((route) => {
    if (!isRecord(route) || Object.keys(route).some(key => !['pattern', 'custom_domain'].includes(key)) || route['custom_domain'] !== true
      || typeof route['pattern'] !== 'string' || !/^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,63}$/i.test(route['pattern'])) {
      return unsupported('custom domain route')
    }
    return route['pattern'].toLowerCase()
  })
}
