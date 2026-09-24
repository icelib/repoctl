const publishBasename = 'gitignore'
const workspaceBasename = '.gitignore'
const normalizedPathPattern = /[\\/]/

function detectSeparator(input: string) {
  if (input.includes('\\') && !input.includes('/')) {
    return '\\'
  }
  return '/'
}

function replaceBasename(input: string, from: string, to: string) {
  if (!input) {
    return input
  }
  const separator = detectSeparator(input)
  const normalized = input.replace(normalizedPathPattern, separator)
  const hasTrailingSeparator = normalized.endsWith(separator)
  const segments = normalized.split(separator)
  if (hasTrailingSeparator && segments.at(-1) === '') {
    segments.pop()
  }
  const lastIndex = segments.length - 1
  if (lastIndex >= 0 && segments[lastIndex] === from) {
    segments[lastIndex] = to
    const rebuilt = segments.join(separator)
    return hasTrailingSeparator ? `${rebuilt}${separator}` : rebuilt
  }
  return input
}

export function toPublishGitignorePath(input: string) {
  return replaceBasename(input, workspaceBasename, publishBasename)
}

export function toWorkspaceGitignorePath(input: string) {
  return replaceBasename(input, publishBasename, workspaceBasename)
}

export function toWorkspaceAssetPath(input: string) {
  return replaceBasename(toWorkspaceGitignorePath(input), 'npmrc', '.npmrc')
}

export function isGitignoreFile(name: string) {
  return toPublishGitignorePath(name) !== name || toWorkspaceGitignorePath(name) !== name
}
