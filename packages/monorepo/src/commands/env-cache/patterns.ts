import process from 'node:process'
import micromatch from 'micromatch'

export interface Declaration {
  pattern: string
  path: string
  field: string
}

function envRegex(pattern: string) {
  let expression = ''
  let wildcard = false
  const value = pattern.startsWith('\\!') ? pattern.slice(1) : pattern
  for (let index = 0; index < value.length; index++) {
    const char = value[index]!
    if (char === '*' && value[index - 1] !== '\\') {
      if (!wildcard) {
        expression += '.*'
      }
      wildcard = true
    }
    else {
      if (char === '*' && value[index - 1] === '\\') {
        expression = expression.slice(0, -2)
      }
      expression += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      wildcard = false
    }
  }
  return new RegExp(`^${expression}$`, process.platform === 'win32' ? 'iu' : 'u')
}

export function envExcluded(name: string, declarations: Declaration[]) {
  return declarations.some(item => item.pattern.startsWith('!') && envRegex(item.pattern.slice(1)).test(name))
}

export function envMatches(name: string, declarations: Declaration[]) {
  return envExcluded(name, declarations) ? [] : declarations.filter(item => !item.pattern.startsWith('!') && envRegex(item.pattern).test(name))
}

export function matchesFile(filename: string, patterns: string[]) {
  return micromatch([filename], patterns, { dot: true }).length > 0
}

export function negativeFileMatch(filename: string, patterns: string[]) {
  return patterns.some(pattern => pattern.startsWith('!') && matchesFile(filename, [pattern.slice(1)]))
}
