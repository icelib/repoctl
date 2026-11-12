import { describe, expect, it } from 'vitest'
import { resolveCommandValues } from '../../src/core/config/resolution'
import { defaultNightlyQualityTimeoutMs, isNightlyQualityTimeout, isNightlySchedule, resolveNightlyConfig } from '../../src/core/nightly/config'

describe('nightly configuration', () => {
  it('defaults to npm and manual dispatch', () => {
    expect(defaultNightlyQualityTimeoutMs).toBe(45 * 60_000)
    expect(resolveNightlyConfig()).toEqual({ provider: 'npm', versioning: 'date' })
    expect(resolveCommandValues('release').values.nightly).toEqual({ provider: 'npm', versioning: 'date' })
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
    expect(resolveNightlyConfig({ provider: 'pkg-pr-new', schedule: '  17   19 * jan mon  ' })).toEqual({ provider: 'pkg-pr-new', versioning: 'snapshot', schedule: '17 19 * JAN MON' })
  })

  it('rejects unknown providers through project validation', () => {
    expect(() => resolveCommandValues('release', JSON.parse('{"nightly":{"provider":"other"}}'))).toThrow()
  })

  it.each([1, 2_700_000, Number.MAX_SAFE_INTEGER])('preserves the configured quality timeout %i', (qualityTimeoutMs) => {
    expect(isNightlyQualityTimeout(qualityTimeoutMs)).toBe(true)
    expect(resolveNightlyConfig({ qualityTimeoutMs })).toEqual({ provider: 'npm', versioning: 'date', qualityTimeoutMs })
    expect(resolveCommandValues('release', { nightly: { qualityTimeoutMs } }).values.nightly).toEqual({ provider: 'npm', versioning: 'date', qualityTimeoutMs })
  })

  it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '2700000', null])('rejects invalid quality timeout %j in direct and project configuration', (qualityTimeoutMs) => {
    const nightly = { qualityTimeoutMs } as never
    expect(isNightlyQualityTimeout(qualityTimeoutMs)).toBe(false)
    expect(() => resolveNightlyConfig(nightly)).toThrow('positive safe integer')
    expect(() => resolveCommandValues('release', { nightly })).toThrow('commands.release.nightly.qualityTimeoutMs')
  })

  it('resolves provider-dependent defaults after project and CLI layers with their origins', () => {
    const defaults = resolveCommandValues('release', { nightly: { provider: 'pkg-pr-new' } })
    expect(defaults.values.nightly).toEqual({ provider: 'pkg-pr-new', versioning: 'snapshot' })
    expect(defaults.origins['nightly.versioning']).toBe('default')
    expect(resolveCommandValues('release', { nightly: { provider: 'pkg-pr-new' } }, { nightly: { provider: 'npm' } }).values.nightly?.versioning).toBe('date')
    const explicit = resolveCommandValues('release', { nightly: { versioning: 'snapshot' } })
    expect(explicit.values.nightly?.versioning).toBe('snapshot')
    expect(explicit.origins['nightly.versioning']).toBe('project')
  })

  it.each(['other', '', 1, null])('rejects invalid versioning %j', (versioning) => {
    const nightly = { versioning } as never
    expect(() => resolveNightlyConfig(nightly)).toThrow('versioning must be')
    expect(() => resolveCommandValues('release', { nightly })).toThrow('commands.release.nightly.versioning')
  })

  it('rejects date versioning with immutable pkg-pr-new URLs in direct and project configuration', () => {
    const nightly = { provider: 'pkg-pr-new', versioning: 'date' } as const
    expect(() => resolveNightlyConfig(nightly)).toThrow('only supports snapshot')
    expect(() => resolveCommandValues('release', { nightly })).toThrow('commands.release.nightly.versioning')
    expect(resolveNightlyConfig({ versioning: 'snapshot' }).versioning).toBe('snapshot')
  })
})
