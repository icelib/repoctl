import type { PackageCheckDiagnostic, PackedPackage } from './types'
import { consumerEntries, supportsResolution } from './entries'

export const packageCheckTools = { publint: '0.3.25', attw: '0.18.5' }

export async function analyzeTarball(packed: PackedPackage) {
  const { checkPackage, createPackageFromTarballData } = await import('@arethetypeswrong/core')
  const { publint } = await import('publint')
  const { formatMessage } = await import('publint/utils')
  const { result, bytes } = packed
  const lint = await publint({ pack: { tarball: bytes.buffer } })
  for (const message of lint.messages) {
    result.diagnostics.push({
      source: 'publint',
      code: message.code,
      severity: message.type === 'suggestion' ? 'info' : message.type,
      message: formatMessage(message, lint.pkg, { color: false }) ?? message.code,
      file: `package.json:${message.path.join('.')}`,
      detail: message,
    })
  }
  const pkg = createPackageFromTarballData(bytes)
  const prefix = `/node_modules/${pkg.packageName}/`
  result.files = pkg.listFiles().map(file => file.slice(prefix.length)).sort()
  packed.manifest = JSON.parse(pkg.readFile(`${prefix}package.json`))
  const entries = consumerEntries(packed.manifest, result.files)
  const analysis = await checkPackage(pkg)
  if (!analysis.types) {
    result.diagnostics.push({ source: 'attw', code: 'UNTYPED_PACKAGE', severity: 'info', message: 'Tarball contains no type declarations; ATTW has no declarations to analyze.' })
    return entries
  }
  const applicable = new Set<number>()
  for (const entry of Object.values(analysis.entrypoints)) {
    for (const [kind, resolution] of Object.entries(entry.resolutions)) {
      if (supportsResolution(entries, entry.subpath, kind, packed.manifest.exports === undefined)) {
        resolution.visibleProblems?.forEach(index => applicable.add(index))
      }
    }
  }
  for (const [index, problem] of analysis.problems.entries()) {
    const diagnostic: PackageCheckDiagnostic = {
      source: 'attw',
      code: problem.kind,
      severity: applicable.has(index) ? 'error' : 'info',
      message: `${problem.kind}${applicable.has(index) ? '' : ' (outside declared Node/TypeScript resolution scenarios)'}`,
      detail: problem,
    }
    if ('entrypoint' in problem) {
      diagnostic.entry = problem.entrypoint
    }
    if ('fileName' in problem) {
      diagnostic.file = problem.fileName
    }
    else if ('typesFileName' in problem) {
      diagnostic.file = problem.typesFileName
    }
    result.diagnostics.push(diagnostic)
  }
  return entries
}
