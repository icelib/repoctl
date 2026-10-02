import picomatch from 'picomatch'

function matchesManifest(relativeDir: string, pattern: string) {
  const normalized = relativeDir.split('\\').join('/').replace(/^\.\//, '')
  // Keep the same manifest expansion as @pnpm/fs.find-packages (tinyglobby).
  const manifestPattern = pattern.replace(/\/?$/, '/package.{json,yaml,json5}')
  return picomatch(manifestPattern, { posix: true })(`${normalized}/package.json`)
}

export function validateWorkspacePackagePatterns(patterns: readonly string[]) {
  for (const pattern of patterns) {
    try {
      const manifestPattern = pattern.replace(/\/?$/, '/package.{json,yaml,json5}')
      picomatch(manifestPattern, { posix: true, strictBrackets: true })
    }
    catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new TypeError(`Invalid pnpm workspace pattern "${pattern}": ${detail}`)
    }
  }
}

function isNegativePattern(pattern: string) {
  return pattern.startsWith('!') && !pattern.startsWith('!(')
}

export function isWorkspacePackageExcluded(relativeDir: string, patterns: readonly string[]) {
  return patterns.some(pattern => isNegativePattern(pattern)
    && (!pattern.startsWith('!!') || pattern.startsWith('!!('))
    && matchesManifest(relativeDir, pattern.slice(1)))
  || picomatch(['**/node_modules/**', '**/bower_components/**'])(`${relativeDir}/package.json`)
}

export function isWorkspacePackageCovered(relativeDir: string, patterns: readonly string[]) {
  if (isWorkspacePackageExcluded(relativeDir, patterns)) {
    return false
  }
  return patterns.filter(pattern => !isNegativePattern(pattern))
    .some(pattern => matchesManifest(relativeDir, pattern))
}

export function escapeWorkspacePackagePath(relativeDir: string) {
  return relativeDir.replace(/[()[\]{}*?!+]/g, '\\$&')
}
