import type { ConsumerRuntimeClosure } from './runtime-closure'
import { mkdtemp, readFile, realpath, symlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import { valid } from 'semver'

interface ConsumerTypeDependency {
  alias: string
  version: string
}

export interface ConsumerTypeToolchain {
  typescript: ConsumerTypeDependency
  nodeTypes: ConsumerTypeDependency
  devDependencies: Record<string, string>
}

export interface InstalledConsumerTypeToolchain {
  tsc: string
  nodeTypes: string
  typeRoots: string
}

async function packageVersion(filename: string, name: string) {
  const manifest = JSON.parse(await readFile(filename, 'utf8')) as { name?: string, version?: string }
  if (manifest.name !== name || !manifest.version || !valid(manifest.version)) {
    throw new Error(`Consumer requires an exact installed ${name} version: ${filename}.`)
  }
  return manifest.version
}

/** Read only the source workspace's installation, never an incidental ancestor. */
export async function consumerTypeScriptVersion(sourceDirectory: string) {
  const workspace = await findWorkspaceDir(sourceDirectory) ?? sourceDirectory
  const filename = path.join(workspace, 'node_modules/typescript/package.json')
  try {
    return await packageVersion(filename, 'typescript')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
  // Typed packages without a workspace compiler retain ATTW's installed version
  // as an explicit default. It is copied into the consumer by the normal install.
  const require = createRequire(import.meta.resolve('@arethetypeswrong/core/package.json'))
  return packageVersion(require.resolve('typescript/package.json'), 'typescript')
}

/** Keep verification tools separate from the package's own runtime integrations. */
export async function consumerTypeToolchain(sourceDirectory: string, dependencies: Record<string, string>, closure: ConsumerRuntimeClosure): Promise<ConsumerTypeToolchain> {
  const occupied = new Set([...Object.keys(dependencies), ...closure.references.map(({ reference }) => reference.alias)])
  const reserve = (base: string) => {
    let alias = base
    for (let suffix = 1; occupied.has(alias); suffix++) {
      alias = `${base}-${suffix}`
    }
    occupied.add(alias)
    return alias
  }
  const typescript = { alias: reserve('repoctl-consumer-typescript'), version: await consumerTypeScriptVersion(sourceDirectory) }
  const nodeTypes = { alias: reserve('repoctl-consumer-node-types'), version: await packageVersion(createRequire(import.meta.url).resolve('@types/node/package.json'), '@types/node') }
  return {
    typescript,
    nodeTypes,
    devDependencies: { [typescript.alias]: `npm:typescript@${typescript.version}`, [nodeTypes.alias]: `npm:@types/node@${nodeTypes.version}` },
  }
}

async function installedTool(directory: string, dependency: ConsumerTypeDependency, name: string, entry: string) {
  const root = await realpath(directory)
  const require = createRequire(path.join(root, 'package.json'))
  const files = await Promise.all([`${dependency.alias}/package.json`, `${dependency.alias}/${entry}`].map(specifier => realpath(require.resolve(specifier))))
  for (const filename of files) {
    const relative = path.relative(root, filename)
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`Consumer resolved ${name} outside its isolated directory.`)
    }
  }
  if (await packageVersion(files[0]!, name) !== dependency.version) {
    throw new Error(`Consumer installed an unexpected ${name} version; expected ${dependency.version}.`)
  }
  return files[1]!
}

export function installedConsumerTypeScript(directory: string, version: string, alias = 'typescript') {
  return installedTool(directory, { alias, version }, 'typescript', 'bin/tsc')
}

export async function installedConsumerTypeToolchain(directory: string, toolchain: ConsumerTypeToolchain): Promise<InstalledConsumerTypeToolchain> {
  const [tsc, nodeTypes] = await Promise.all([
    installedConsumerTypeScript(directory, toolchain.typescript.version, toolchain.typescript.alias),
    installedTool(directory, toolchain.nodeTypes, '@types/node', 'index.d.ts'),
  ])
  // Node declarations and their dependencies reference the conventional "node"
  // type name. Resolve it in a dedicated root, leaving runtime @types/node alone.
  const typeRoots = await mkdtemp(path.join(await realpath(directory), '.repoctl-type-roots-'))
  await symlink(path.dirname(nodeTypes), path.join(typeRoots, 'node'), 'junction')
  return { tsc, nodeTypes: 'node', typeRoots }
}
