import YAML, { isAlias, isMap } from 'yaml'
import { record } from '../files'

export function catalogName(value = 'default') {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
    throw new Error('Select a nonempty catalog name (default or a named catalog).')
  }
  return value
}

export function readCatalogs(workspace: Record<string, unknown>) {
  const named = record(workspace['catalogs'])
  if (workspace['catalogs'] != null && !named) {
    throw new Error('pnpm-workspace.yaml catalogs must be a mapping.')
  }
  if (workspace['catalog'] != null && named?.['default'] != null) {
    throw new Error('The default catalog is defined twice; use catalog or catalogs.default, not both.')
  }
  const catalogs = new Map<string, Record<string, string>>()
  const items = [...Object.entries(named ?? {})]
  if (workspace['catalog'] != null) {
    items.push(['default', workspace['catalog']])
  }
  for (const [name, value] of items.sort(([a], [b]) => a.localeCompare(b))) {
    catalogName(name)
    const entries = record(value)
    if (!entries || Object.values(entries).some(entry => typeof entry !== 'string')) {
      throw new Error(`Catalog ${name} must map dependency names to string specifiers.`)
    }
    catalogs.set(name, entries as Record<string, string>)
  }
  return catalogs
}

export function catalogEntry(catalogs: Map<string, Record<string, string>>, name: string, dependency: string) {
  const entries = catalogs.get(name)
  return entries && Object.hasOwn(entries, dependency) ? entries[dependency] : undefined
}

export function addCatalogEntry(original: string, name: string, dependency: string, target: string) {
  const document = YAML.parseDocument(original, { keepSourceTokens: true })
  if (document.errors.length) {
    throw document.errors[0]
  }
  const location = name === 'default' && !document.hasIn(['catalogs', 'default']) ? ['catalog'] : ['catalogs', name]
  for (let index = 0; index <= location.length; index++) {
    const node = index ? document.getIn(location.slice(0, index), true) : document.contents
    if (isAlias(node) || (isMap(node) && node.anchor)) {
      throw new Error('Catalog migration cannot edit an anchored or aliased catalog mapping; make that mapping explicit first.')
    }
  }
  document.setIn([...location, dependency], target)
  let output = document.toString({ lineWidth: 0 })
  if (!original.endsWith('\n')) {
    output = output.replace(/\n$/, '')
  }
  return original.includes('\r\n') ? output.replaceAll('\n', '\r\n') : output
}
