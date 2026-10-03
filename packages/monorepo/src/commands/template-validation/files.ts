import type { TemplateValidationDiagnostic } from './types'
import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { shouldSkipTemplatePath } from '@icebreakers/monorepo-templates'

export function inside(root: string, candidate: string) {
  const relative = path.relative(root, candidate)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

export async function templateFiles(root: string): Promise<string[]> {
  const files: string[] = []
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (shouldSkipTemplatePath(root, file)) {
        continue
      }
      if (entry.isDirectory()) {
        await walk(file)
      }
      else {
        files.push(file)
      }
    }
  }
  await walk(root)
  return files.sort()
}

export async function inspectGeneratedFiles(workspace: string, target: string, sources: string[]) {
  const diagnostics: TemplateValidationDiagnostic[] = []
  for (const file of await templateFiles(target)) {
    const relative = path.relative(workspace, file)
    if ((await lstat(file)).isSymbolicLink()) {
      const resolved = await realpath(file).catch(() => '')
      if (!resolved || !inside(workspace, resolved)) {
        diagnostics.push({ code: 'EXTERNAL_LINK', file: relative, message: 'Generated link is broken or points outside the validation workspace.' })
      }
      continue
    }
    if (!/\.(?:[cm]?[jt]sx?|vue|jsonc?|ya?ml|css|scss)$/u.test(file)) {
      continue
    }
    const content = await readFile(file, 'utf8')
    if (path.basename(file) === 'package.json') {
      const manifest = JSON.parse(content)
      for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        for (const [name, specifier] of Object.entries(manifest[section] ?? {})) {
          if (typeof specifier === 'string' && /^(?:file:|link:|[./])/u.test(specifier)) {
            const target = path.resolve(path.dirname(file), specifier.replace(/^(?:file:|link:)/u, ''))
            if (!inside(workspace, target)) {
              diagnostics.push({ code: 'EXTERNAL_DEPENDENCY', file: relative, message: `Dependency ${name} resolves outside the generated workspace: ${specifier}` })
            }
          }
        }
      }
    }
    if (sources.some(source => content.includes(source) || content.includes(JSON.stringify(source).slice(1, -1))) || content.includes('tooling/load-tooling-module.mjs')) {
      diagnostics.push({ code: 'SOURCE_PATH_LEAK', file: relative, message: 'Generated file refers to the author/source repository.' })
    }
    const references = [...content.matchAll(/(?:from\s*|(?:import|require)\s*\(\s*|import\s*|"(?:extends|path)"\s*:\s*)['"]([^'"]+)['"]/gu)]
    for (const match of references) {
      const value = match[1]!
      if ((value.startsWith('.') && !inside(workspace, path.resolve(path.dirname(file), value))) || path.isAbsolute(value) || value.startsWith('file:')) {
        diagnostics.push({ code: 'EXTERNAL_REFERENCE', file: relative, message: `Reference leaves the generated workspace: ${value}` })
      }
    }
  }
  return diagnostics
}
