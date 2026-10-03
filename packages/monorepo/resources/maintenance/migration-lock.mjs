/** Read only canonical pnpm block mappings on the installed repoctl dependency chain. */
export function maintenanceTemplateVersion({ lock, toolVersion, fail }) {
  const reject = () => fail('migration target requires an unambiguous locked repoctl template dependency chain')
  const documents = lock.toString().split(/^---\s*$/mu).filter(document => document.trim())
  if (!documents.length || documents.length > 2 || documents.some(document => /\t/u.test(document))) {
    reject()
  }
  const scalar = (text) => {
    const value = text.replace(/\s+#.*$/u, '').trim()
    if (value.startsWith('"')) {
      try {
        return JSON.parse(value)
      }
      catch {
        reject()
      }
    }
    if (value.startsWith('\'')) {
      if (!/^'[^']*'$/u.test(value)) {
        reject()
      }
      return value.slice(1, -1)
    }
    if (!value || /[\s[\]{}&*!|>#]/u.test(value)) {
      reject()
    }
    return value
  }
  const entry = (block, indent, name, required = true) => {
    const found = []
    for (let index = 0; index < block.length; index++) {
      const line = block[index]
      const width = line.length - line.trimStart().length
      if (width < indent) {
        reject()
      }
      if (width !== indent) {
        continue
      }
      const match = /^\s*("[^"]+"|'[^']+'|[^:'"\s][^:]*):(?: (.*))?$/u.exec(line)
      if (!match) {
        reject()
      }
      if (scalar(match[1]) !== name) {
        continue
      }
      let end = index + 1
      while (end < block.length && block[end].length - block[end].trimStart().length > indent) {
        end++
      }
      found.push({ value: match[2]?.trim() ?? '', lines: block.slice(index + 1, end) })
    }
    if (found.length > 1 || (required && found.length !== 1)) {
      reject()
    }
    return found[0]
  }
  const mapping = (parent, indent, name, required = true) => {
    const item = entry(parent, indent, name, required)
    if (!item) {
      return null
    }
    if (item.value && !item.value.startsWith('#')) {
      reject()
    }
    return item.lines
  }
  const value = (parent, indent, name) => {
    const item = entry(parent, indent, name)
    if (item.lines.length) {
      reject()
    }
    return scalar(item.value)
  }
  const resolution = (text) => {
    if (typeof text !== 'string' || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[\dA-Z.-]+)?(?:\+[\dA-Z.-]+)?(?:\([^\r\n]+\))?$/iu.test(text)) {
      reject()
    }
    return text.split('(')[0]
  }
  const candidates = []
  for (const document of documents) {
    const lines = document.split('\n').filter(line => line.trim() && !line.trimStart().startsWith('#'))
    if (value(lines, 0, 'lockfileVersion') !== '9.0') {
      reject()
    }
    const importer = mapping(mapping(lines, 0, 'importers'), 2, '.')
    if (!entry(importer, 4, 'packageManagerDependencies', false) && !entry(importer, 4, 'configDependencies', false)) {
      candidates.push({ lines, importer })
    }
  }
  if (candidates.length !== 1) {
    reject()
  }
  const { lines, importer } = candidates[0]
  const roots = []
  for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const dependencies = mapping(importer, 4, group, false)
    if (!dependencies) {
      continue
    }
    const tool = mapping(dependencies, 6, 'repoctl', false)
    if (tool) {
      roots.push(value(tool, 8, 'version'))
    }
  }
  if (roots.length !== 1 || resolution(roots[0]) !== toolVersion) {
    reject()
  }
  const snapshots = mapping(lines, 0, 'snapshots')
  const dependency = (name, resolved, child) => {
    resolution(resolved)
    const snapshot = mapping(snapshots, 2, `${name}@${resolved}`)
    return value(mapping(snapshot, 4, 'dependencies'), 6, child)
  }
  const engine = dependency('repoctl', roots[0], '@icebreakers/monorepo')
  const templates = dependency('@icebreakers/monorepo', engine, '@icebreakers/monorepo-templates')
  return resolution(templates)
}
