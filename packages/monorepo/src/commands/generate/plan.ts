import type { GenerateOptions, GeneratePlan } from './types'
import { realpath } from 'node:fs/promises'
import { resolveTemplateParameters } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import { clearWorkspaceCache, getWorkspaceData } from '../../core/workspace'
import { hash } from '../deps/files'
import { updateGeneratorExports } from './exports'
import { generatorFile, generatorPath } from './files'
import { generatorIdentity, generators, renderGenerator } from './render'

function declared(manifest: Record<string, unknown>, dependency: string) {
  return ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].some((field) => {
    const values = manifest[field]
    return values && typeof values === 'object' && Object.hasOwn(values, dependency)
  })
}

/** Resolve one package, validate its framework, and derive every byte without writing. */
export async function planGenerate(options: GenerateOptions): Promise<GeneratePlan> {
  if (!options || !generators.includes(options.generator) || typeof options.package !== 'string' || !options.package) {
    throw new Error('Choose a supported generator and an exact workspace package name or relative directory.')
  }
  const parameters = resolveTemplateParameters({ name: { type: 'string', required: true }, export: { type: 'boolean', default: false } }, options.parameters)
  const { name, symbol: baseSymbol } = generatorIdentity(parameters.values['name'])
  const symbol = options.generator === 'hono-route' ? `${baseSymbol[0]!.toLowerCase()}${baseSymbol.slice(1)}Route` : baseSymbol
  clearWorkspaceCache()
  const data = await getWorkspaceData(options.cwd, { ignorePrivatePackage: false })
  const workspaceDir = path.normalize(await realpath(data.workspaceDir))
  const selected = data.packages.filter(pkg => pkg.manifest['name'] === options.package || path.relative(workspaceDir, pkg.rootDir) === options.package)
  if (selected.length !== 1) {
    throw new Error(`Expected exactly one workspace package for ${options.package}; found ${selected.length}.`)
  }
  const pkg = selected[0]!
  const relativeDir = generatorPath(path.relative(workspaceDir, pkg.rootDir))
  const packageDir = path.join(workspaceDir, relativeDir)
  const packageText = await generatorFile(workspaceDir, `${relativeDir}/package.json`)
  if (packageText === null) {
    throw new Error('The selected package has no package.json.')
  }
  const manifest = JSON.parse(packageText) as Record<string, unknown>
  const dependency = options.generator === 'vue-component' ? 'vue' : options.generator === 'react-component' ? 'react' : 'hono'
  if (!declared(manifest, dependency)) {
    throw new Error(`Generator ${options.generator} requires the selected package to declare ${dependency}.`)
  }
  const directory = generatorPath(options.directory ?? (options.generator === 'hono-route' ? 'src/routes' : 'src/components'))
  const barrel = generatorPath(options.barrel ?? 'src/index.ts')
  if (parameters.values['export'] && !barrel.endsWith('.ts')) {
    throw new Error('The export barrel must be a TypeScript .ts file.')
  }
  const specifier = path.relative('test', `${directory}/${name}`)
  const rendered = renderGenerator(options.generator, symbol, specifier.startsWith('.') ? specifier : `./${specifier}`)
  const source = `${directory}/${name}.${rendered.extension}`
  const test = `test/${name}.test.${rendered.testExtension}`
  const desired = new Map([[source, rendered.source], [test, rendered.test]])
  const rootText = await generatorFile(workspaceDir, 'package.json')
  const rootManifest = rootText ? JSON.parse(rootText) as Record<string, unknown> : {}
  const inputs: Record<string, string> = { 'package.json': hash(packageText), 'workspace:package.json': rootText === null ? 'missing' : hash(rootText) }
  if (parameters.values['export']) {
    if (desired.has(barrel)) {
      throw new Error('The export barrel cannot be a generated source or test.')
    }
    const original = await generatorFile(packageDir, barrel)
    desired.set(barrel, updateGeneratorExports(workspaceDir, barrel, original ?? '', source, symbol, options.generator === 'vue-component'))
    inputs[barrel] = original === null ? 'missing' : hash(original)
  }
  const nested = data.packages.map(item => path.relative(packageDir, item.rootDir)).filter(item => item && !item.startsWith('../') && !path.isAbsolute(item))
  const files = []
  for (const [file, after] of desired) {
    if (nested.some(child => file.startsWith(`${child}/`))) {
      throw new Error(`Generator output belongs to a nested workspace package: ${file}`)
    }
    const before = await generatorFile(packageDir, file)
    if (!(parameters.values['export'] && file === barrel) && before !== null && before !== after) {
      throw new Error(`Generator file conflict: ${file}`)
    }
    files.push({ path: file, before, after, action: before === after ? 'unchanged' as const : before === null ? 'create' as const : 'update' as const })
  }
  const nextSteps = [`Run pnpm --filter ./${relativeDir} build, lint, typecheck and test.`]
  const testing = options.generator === 'vue-component' ? '@vue/test-utils' : options.generator === 'react-component' ? '@testing-library/react' : undefined
  const missing = ['vitest', ...(testing ? [testing] : [])].filter(value => !declared(manifest, value) && !declared(rootManifest, value))
  if (missing.length) {
    nextSteps.push(`Ensure ${missing.join(', ')} and a compatible Vitest environment are available in the selected package before running its generated tests.`)
  }
  if (options.generator === 'hono-route') {
    nextSteps.push(`In your Hono application, import { ${symbol} } from './${source.replace(/^src\//, '').replace(/\.ts$/, '')}' and register app.route('/${name}', ${symbol}). Review the mount path and middleware ordering; repoctl does not infer the application entry.`)
  }
  return {
    schemaVersion: 1,
    workspaceDir,
    packageDir,
    packageName: String(manifest['name'] ?? relativeDir),
    options: { cwd: workspaceDir, package: relativeDir, generator: options.generator, parameters: parameters.retained, directory, barrel },
    inputs,
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
    nextSteps,
  }
}
