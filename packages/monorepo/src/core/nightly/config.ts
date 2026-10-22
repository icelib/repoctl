import type { ReleaseNightlyConfig } from '../../types/release'

const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const weekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function cronField(field: string, minimum: number, maximum: number, names: string[] = []) {
  const number = (value: string) => /^\d+$/u.test(value) ? Number(value) : names.includes(value) ? names.indexOf(value) + minimum : Number.NaN
  return field.split(',').every((part) => {
    const pieces = part.split('/')
    if (pieces.length > 2 || (pieces.length === 2 && (!/^\d+$/u.test(pieces[1]!) || Number(pieces[1]) < 1 || Number(pieces[1]) > maximum - minimum + 1))) {
      return false
    }
    if (pieces[0] === '*') {
      return true
    }
    const bounds = pieces[0]!.split('-')
    if (bounds.length > 2) {
      return false
    }
    const start = number(bounds[0]!)
    const end = bounds.length === 2 ? number(bounds[1]!) : start
    return Number.isInteger(start) && Number.isInteger(end) && minimum <= start && start <= end && end <= maximum
  })
}

/** GitHub Actions supports five UTC cron fields, without macros or seconds. */
export function isNightlySchedule(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim() || /[\r\n]/u.test(value)) {
    return false
  }
  const fields = value.trim().toUpperCase().split(/\s+/u)
  return fields.length === 5
    && cronField(fields[0]!, 0, 59)
    && cronField(fields[1]!, 0, 23)
    && cronField(fields[2]!, 1, 31)
    && cronField(fields[3]!, 1, 12, months)
    && cronField(fields[4]!, 0, 6, weekdays)
}

export function resolveNightlyConfig(config: ReleaseNightlyConfig = {}) {
  const provider = config.provider ?? 'npm'
  if (provider !== 'npm' && provider !== 'pkg-pr-new') {
    throw new Error('Nightly provider must be npm or pkg-pr-new.')
  }
  if (config.schedule !== undefined && !isNightlySchedule(config.schedule)) {
    throw new Error('Nightly schedule must be a valid five-field UTC GitHub Actions cron expression.')
  }
  return { provider, ...(config.schedule === undefined ? {} : { schedule: config.schedule.trim().toUpperCase().replaceAll(/\s+/gu, ' ') }) }
}
