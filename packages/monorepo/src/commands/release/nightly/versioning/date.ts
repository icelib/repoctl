import { parse, valid } from 'semver'

export function nightlyBaseVersion(version: string) {
  const parsed = parse(version)
  if (!parsed) {
    throw new Error(`Invalid nightly base version: ${version}.`)
  }
  return `${parsed.major}.${parsed.minor}.${parsed.patch}`
}

/** Accept only canonical SemVer with a real UTC calendar date and safe counter. */
export function parseDateNightlyVersion(version: string) {
  const match = /^(\d+\.\d+\.\d+)-dev\.(\d{4})(\d{2})(\d{2})\.([1-9]\d*)$/u.exec(version)
  if (!match || !valid(version)) {
    return null
  }
  const date = `${match[2]}${match[3]}${match[4]}`
  const instant = new Date(`${match[2]}-${match[3]}-${match[4]}T00:00:00.000Z`)
  const sequence = Number(match[5])
  if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10).replaceAll('-', '') !== date || !Number.isSafeInteger(sequence)) {
    return null
  }
  return { base: match[1]!, date, sequence }
}
