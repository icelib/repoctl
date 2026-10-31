import { describe, expect, it } from 'vitest'
import { resolveCommandValues } from '../../src/core/config/resolution'
import { defaultNightlyQualityTimeoutMs, isNightlyQualityTimeout, isNightlySchedule, resolveNightlyConfig } from '../../src/core/nightly/config'

describe('nightly configuration', () => {
  it('defaults to npm and manual dispatch', () => {
    expect(defaultNightlyQualityTimeoutMs).toBe(45 * 60_000)
    expect(resolveNightlyConfig()).toEqual({ provider: 'npm' })
    expect(resolveCommandValues('release').values.nightly).toEqual({ provider: 'npm' })
  })

  it.each(['17 19 * * *', '0,30 1-3 * JAN,MAR MON-FRI', '*/5 0 1-31/2 1-12 0-6'])('accepts GitHub UTC cron %s', (schedule) => {
    expect(isNightlySchedule(schedule)).toBe(true)
    expect(resolveCommandValues('release', { nightly: { schedule } }).values.nightly?.schedule).toBe(schedule)
  })

  it.each(['', '@daily', '* * * * * *', '60 0 * * *', '0 24 * * *', '0 0 0 * *', '0 0 * 13 *', '0 0 * * 7', '*/0 * * * *', '* * * * MON-SUN', '* * * * *\n', '1,,2 * * * *', '* * * * *\' || true'])('rejects malformed or unsupported cron %j', (schedule) => {
    expect(isNightlySchedule(schedule)).toBe(false)
    expect(() => resolveCommandValues('release', { nightly: { schedule } })).toThrow()
  })

  it('normalizes cron consistently and allows the explicit preview provider', () => {
    expect(resolveNightlyConfig({ provider: 'pkg-pr-new', schedule: '  17   19 * jan mon  ' })).toEqual({ provider: 'pkg-pr-new', schedule: '17 19 * JAN MON' })
  })

  it('rejects unknown providers through project validation', () => {
    expect(() => resolveCommandValues('release', JSON.parse('{"nightly":{"provider":"other"}}'))).toThrow()
  })

  it.each([1, 2_700_000, Number.MAX_SAFE_INTEGER])('preserves the configured quality timeout %i', (qualityTimeoutMs) => {
    expect(isNightlyQualityTimeout(qualityTimeoutMs)).toBe(true)
    expect(resolveNightlyConfig({ qualityTimeoutMs })).toEqual({ provider: 'npm', qualityTimeoutMs })
    expect(resolveCommandValues('release', { nightly: { qualityTimeoutMs } }).values.nightly).toEqual({ provider: 'npm', qualityTimeoutMs })
  })

  it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '2700000', null])('rejects invalid quality timeout %j in direct and project configuration', (qualityTimeoutMs) => {
    const nightly = { qualityTimeoutMs } as never
    expect(isNightlyQualityTimeout(qualityTimeoutMs)).toBe(false)
    expect(() => resolveNightlyConfig(nightly)).toThrow('positive safe integer')
    expect(() => resolveCommandValues('release', { nightly })).toThrow('commands.release.nightly.qualityTimeoutMs')
  })
})
