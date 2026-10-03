import type { EnvCacheEvidence, EnvCacheFinding } from '../../types/env-cache'
import { spawnSync } from 'node:child_process'
import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'pathe'
import { glob } from 'tinyglobby'
import { matchesFile } from './patterns'
import { scanExample, scanSource } from './scan'

const ignored = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/coverage/**', '**/.turbo/**', '**/.repoctl/**', '**/.next/**', '**/.nuxt/**', '**/out/**']
const sourcePattern = /\.(?:[cm]?[jt]sx?|vue|svelte)$/i
const envPattern = /^(?:\.env|\.dev\.vars)(?:\.|$)/
const examplePattern = /^(?:\.env|\.dev\.vars)(?:\.[\w-]+)*\.example$/

export function finding(rule: string, pkg: string, task: string | null, message: string, fields: Partial<EnvCacheFinding> = {}): EnvCacheFinding {
  return { rule, package: pkg, task, severity: 'warn', variable: null, path: null, line: null, message, ...fields }
}

/** Source and example reads reject links; actual dotenv files are only enumerated. */
async function readSafe(root: string, filename: string) {
  const target = path.join(root, filename)
  if (path.resolve(await realpath(target)) !== target) {
    throw new Error('Linked scan input')
  }
  const info = await lstat(target)
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 2 * 1024 * 1024) {
    throw new Error('Unsupported scan input')
  }
  return readFile(target, 'utf8')
}

export async function scanPackage(root: string, pkg: { name: string, directory: string }, packageDirectories: string[], include?: string[], exclude: string[] = []) {
  const directory = path.relative(root, pkg.directory)
  const nested = packageDirectories.filter(other => other !== pkg.directory && other.startsWith(`${pkg.directory}/`)).map(other => `${path.relative(pkg.directory, other)}/**`)
  const files = await glob(['**/*'], { cwd: pkg.directory, dot: true, onlyFiles: true, followSymbolicLinks: false, ignore: [...ignored, ...nested, ...exclude] })
  const references = new Map<string, EnvCacheEvidence[]>()
  const dynamic: EnvCacheEvidence[] = []
  const environmentFiles: string[] = []
  const findings: EnvCacheFinding[] = []
  for (const local of files.sort()) {
    const relative = path.join(directory, local)
    if (/[\p{Cc}\p{Cf}]/u.test(relative)) {
      findings.push(finding('env-scan-input', pkg.name, null, 'A filename contains unsupported control characters; its contents were not read.'))
      continue
    }
    const basename = path.basename(local)
    const environment = envPattern.test(basename)
    if (environment) {
      environmentFiles.push(relative)
    }
    const example = examplePattern.test(basename)
    if ((!example && (environment || !sourcePattern.test(local))) || (include && !matchesFile(local, include))) {
      continue
    }
    try {
      const source = await readSafe(root, relative)
      const result = example ? scanExample(relative, source) : scanSource(relative, source)
      for (const [name, evidence] of result.variables) {
        references.set(name, [...(references.get(name) ?? []), ...evidence])
      }
      dynamic.push(...result.dynamic)
      for (const line of result.parseErrors) {
        findings.push(finding('env-source-unparsed', pkg.name, null, 'Source syntax could not be parsed; source text and parser details are omitted.', { path: relative, line }))
      }
    }
    catch {
      findings.push(finding('env-scan-input', pkg.name, null, 'A linked, oversized or unreadable source/example file was not scanned.', { path: relative }))
    }
  }
  return { references, dynamic, environmentFiles, findings }
}

/** Git path enumeration establishes default-input coverage without loading env values. */
export function defaultInputs(root: string, files: string[]): Set<string> | null {
  if (!files.length) {
    return new Set()
  }
  const result = spawnSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...files], { encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024 })
  return result.status === 0 ? new Set(result.stdout.split('\0').filter(Boolean)) : null
}
