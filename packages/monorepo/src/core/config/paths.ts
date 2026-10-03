/** Dot paths escape literal dots and backslashes in dynamic map keys. */
export function appendConfigPath(prefix: string, key: string): string {
  const escaped = key.replaceAll('\\', '\\\\').replaceAll('.', '\\.')
  return prefix ? `${prefix}.${escaped}` : escaped
}

export function splitConfigPath(field: string): string[] {
  const parts = ['']
  let escaped = false
  for (const character of field) {
    if (escaped) {
      parts[parts.length - 1] += character
      escaped = false
    }
    else if (character === '\\') {
      escaped = true
    }
    else if (character === '.') {
      parts.push('')
    }
    else {
      parts[parts.length - 1] += character
    }
  }
  return parts
}
