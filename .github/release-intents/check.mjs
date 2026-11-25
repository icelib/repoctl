import { execFileSync } from 'node:child_process'
import process from 'node:process'

const packageDependencyFields = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
const releaseBumps = new Set(['major', 'minor', 'patch', 'none'])

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  }
  catch (error) {
    const detail = error.stderr?.toString().trim()
    throw new Error(`Unable to inspect frozen release inputs with git ${args[0]}${detail ? `: ${detail}` : '.'}`)
  }
}

function changedFiles(baseSha, headSha) {
  const output = git(['diff', '--name-status', '--no-renames', '-z', baseSha, headSha, '--'])
  const fields = output.split('\0')
  const changes = []
  for (let index = 0; index < fields.length - 1;) {
    const status = fields[index++]
    const file = fields[index++]
    if (!status || !file) {
      throw new Error('Unable to parse the frozen release-input diff.')
    }
    changes.push({ status, file })
  }
  return changes
}

function excludedInput(file) {
  const segments = file.split('/')
  const excludedDirectories = new Set(['dist', 'docs', 'test', 'tests', '__tests__', '__snapshots__', 'e2e'])
  if (segments.some(segment => excludedDirectories.has(segment.toLowerCase()))) {
    return true
  }
  const filename = segments.at(-1)?.toLowerCase() ?? ''
  return /^readme(?:\..+)?$/u.test(filename)
    || /^changelog(?:\..+)?$/u.test(filename)
    || /\.(?:test|spec)\.[^.]+$/u.test(filename)
}

function yamlPair(line) {
  const indent = line.length - line.trimStart().length
  const separator = line.indexOf(':', indent)
  if (separator < 0) {
    return undefined
  }
  const sourceKey = line.slice(indent, separator).trim()
  let key = sourceKey
  if (sourceKey.startsWith('"') && sourceKey.endsWith('"')) {
    key = JSON.parse(sourceKey)
  }
  else if (sourceKey.startsWith('\'') && sourceKey.endsWith('\'')) {
    key = sourceKey.slice(1, -1).replaceAll('\'\'', '\'')
  }
  return { indent, key, value: line.slice(separator + 1).trim() }
}

function withoutYamlComment(line) {
  return line.replace(/\s+#.*$/u, '').trimEnd()
}

function yamlScalar(value) {
  const scalar = value.trim()
  if (scalar.startsWith('"') && scalar.endsWith('"')) {
    return JSON.parse(scalar)
  }
  if (scalar.startsWith('\'') && scalar.endsWith('\'')) {
    return scalar.slice(1, -1).replaceAll('\'\'', '\'')
  }
  return scalar
}

function parseCatalogs(source, revision) {
  const catalogs = new Map()
  let section
  let namedCatalog
  for (const [index, rawLine] of source.split(/\r?\n/u).entries()) {
    const line = withoutYamlComment(rawLine)
    if (!line.trim()) {
      continue
    }
    const pair = yamlPair(line)
    if (pair?.indent === 0) {
      namedCatalog = undefined
      if (pair.key === 'catalog' || pair.key === 'catalogs') {
        if (pair.value) {
          throw new Error(`Unsupported inline ${pair.key} configuration in ${revision} pnpm-workspace.yaml.`)
        }
        section = pair.key
      }
      else {
        section = undefined
      }
      continue
    }
    if (!section) {
      continue
    }
    if (!pair) {
      throw new Error(`Cannot parse catalog metadata at ${revision} pnpm-workspace.yaml:${index + 1}.`)
    }
    if (section === 'catalog') {
      if (pair.indent !== 2 || !pair.value) {
        throw new Error(`Unsupported catalog entry at ${revision} pnpm-workspace.yaml:${index + 1}.`)
      }
      catalogs.set(`default\0${pair.key}`, yamlScalar(pair.value))
      continue
    }
    if (pair.indent === 2 && !pair.value) {
      namedCatalog = pair.key
      continue
    }
    if (pair.indent === 4 && pair.value && namedCatalog) {
      catalogs.set(`${namedCatalog}\0${pair.key}`, yamlScalar(pair.value))
      continue
    }
    throw new Error(`Unsupported named catalog entry at ${revision} pnpm-workspace.yaml:${index + 1}.`)
  }
  return catalogs
}

function parseChangeset(source) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(source)?.[1]
  if (frontmatter === undefined) {
    return new Set()
  }
  const packages = new Set()
  for (const rawLine of frontmatter.split(/\r?\n/u)) {
    const line = withoutYamlComment(rawLine)
    if (!line.trim()) {
      continue
    }
    const pair = yamlPair(line)
    if (!pair || pair.indent !== 0 || !releaseBumps.has(yamlScalar(pair.value))) {
      return new Set()
    }
    packages.add(pair.key)
  }
  return packages
}

function publicPackage(manifest) {
  return typeof manifest.name === 'string' && manifest.name.length > 0 && manifest.private !== true
}

function readPackages(revision) {
  const manifestPaths = git(['ls-tree', '-r', '--name-only', '-z', revision, '--', 'packages'])
    .split('\0')
    .filter(file => /^packages\/[^/]+\/package\.json$/u.test(file))
  const packages = new Map()
  for (const manifestPath of manifestPaths) {
    let manifest
    try {
      manifest = JSON.parse(git(['show', `${revision}:${manifestPath}`]))
    }
    catch (error) {
      throw new Error(`Cannot read package metadata at ${revision}:${manifestPath}. ${error.message}`)
    }
    const directory = manifestPath.split('/')[1]
    packages.set(directory, { manifest, name: manifest.name })
  }
  return packages
}

function addPublicPackageNames(target, packages, directory) {
  const entry = packages.get(directory)
  if (entry && publicPackage(entry.manifest)) {
    target.add(entry.name)
  }
}

function catalogConsumers(packages, catalog, dependency) {
  const consumers = new Set()
  for (const entry of packages.values()) {
    if (!publicPackage(entry.manifest)) {
      continue
    }
    for (const field of packageDependencyFields) {
      const dependencies = entry.manifest[field]
      if (!dependencies || typeof dependencies !== 'object') {
        continue
      }
      if (dependencies[dependency] === `catalog:${catalog === 'default' ? '' : catalog}`) {
        consumers.add(entry.name)
      }
    }
  }
  return consumers
}

function addCatalogImpacts(affected, baseCatalogs, headCatalogs, basePackages, headPackages) {
  const changedEntries = new Set()
  for (const key of new Set([...baseCatalogs.keys(), ...headCatalogs.keys()])) {
    if (baseCatalogs.get(key) !== headCatalogs.get(key)) {
      const separator = key.indexOf('\0')
      changedEntries.add([key.slice(0, separator), key.slice(separator + 1)])
    }
  }
  for (const [catalog, dependency] of changedEntries) {
    for (const name of catalogConsumers(basePackages, catalog, dependency)) {
      affected.add(name)
    }
    for (const name of catalogConsumers(headPackages, catalog, dependency)) {
      affected.add(name)
    }
  }
}

export function validateReleaseIntent(baseSha, headSha) {
  if (!baseSha || !headSha) {
    throw new Error('BASE_SHA and HEAD_SHA are required to validate release intent.')
  }

  const changes = changedFiles(baseSha, headSha)
  const basePackages = readPackages(baseSha)
  const headPackages = readPackages(headSha)
  const affected = new Set()

  for (const { file } of changes) {
    if (excludedInput(file)) {
      continue
    }
    const packageMatch = /^packages\/([^/]+)\//u.exec(file)
    if (packageMatch) {
      const owner = packageMatch[1] === 'monorepo' && file.startsWith('packages/monorepo/assets/')
        ? 'monorepo-templates'
        : packageMatch[1]
      addPublicPackageNames(affected, basePackages, owner)
      addPublicPackageNames(affected, headPackages, owner)
    }
    if (file === '.github/workflows/release-intent-check.yml' || file.startsWith('.github/release-intents/')) {
      addPublicPackageNames(affected, basePackages, 'monorepo-templates')
      addPublicPackageNames(affected, headPackages, 'monorepo-templates')
    }
  }

  const baseWorkspace = git(['show', `${baseSha}:pnpm-workspace.yaml`])
  const headWorkspace = git(['show', `${headSha}:pnpm-workspace.yaml`])
  addCatalogImpacts(
    affected,
    parseCatalogs(baseWorkspace, 'base'),
    parseCatalogs(headWorkspace, 'head'),
    basePackages,
    headPackages,
  )

  if (affected.size === 0) {
    return { affected, missing: new Set() }
  }

  const declared = new Set()
  for (const { status, file } of changes) {
    if (!/^[AM]$/u.test(status) || !/^\.changeset\/[^/]+\.md$/u.test(file) || excludedInput(file)) {
      continue
    }
    for (const name of parseChangeset(git(['show', `${headSha}:${file}`]))) {
      declared.add(name)
    }
  }

  return {
    affected,
    missing: new Set([...affected].filter(name => !declared.has(name))),
  }
}

function main() {
  const [baseSha, headSha] = process.argv.slice(2)
  const result = validateReleaseIntent(baseSha ?? process.env.BASE_SHA, headSha ?? process.env.HEAD_SHA)
  if (!result.affected.size) {
    process.stdout.write('No publishable package inputs detected.\n')
    return
  }
  if (!result.missing.size) {
    process.stdout.write(`Release intent covers affected packages: ${[...result.affected].sort().join(', ')}\n`)
    return
  }
  process.stderr.write('Publishable package changes require release intent for every affected package.\n')
  process.stderr.write(`Missing .changeset entries: ${[...result.missing].sort().join(', ')}\n`)
  process.stderr.write('Add each package to an updated .changeset/*.md with major, minor, patch, or explicit none.\n')
  process.exitCode = 1
}

try {
  main()
}
catch (error) {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
}
