import { expect, it } from 'vitest'
import { verifyNightlyConsumer } from '../../../../../src/commands/release/nightly/consumer'
import { completed, consumerFixture, missingVersion } from './fixture'

it.each([
  ['external package', missingVersion('external@snapshot-nightly')],
  ['external alias target', missingVersion('@scope/a@npm:external@snapshot-nightly')],
  ['alias with old batch version', missingVersion('aliased@npm:@scope/a@1.0.0')],
  ['other version of a batch package', missingVersion('@scope/a@1.0.0')],
  ['other tag of a batch package', missingVersion('@scope/a@snapshot-nightly-other')],
  ['authentication', missingVersion('@scope/a@snapshot-nightly', 'ERR_PNPM_FETCH_401')],
  ['authorization', missingVersion('@scope/a@snapshot-nightly', 'ERR_PNPM_FETCH_403')],
  ['network', missingVersion('@scope/a@snapshot-nightly', 'ERR_PNPM_FETCH_ERROR')],
  ['integrity', missingVersion('@scope/a@snapshot-nightly', 'ERR_PNPM_TARBALL_INTEGRITY')],
  ['mixed errors', `${missingVersion('@scope/a@snapshot-nightly')}\n${missingVersion('@scope/a@snapshot-nightly', 'ERR_PNPM_FETCH_401')}`],
  ['nested conflicting error', JSON.stringify({ ...JSON.parse(missingVersion('@scope/a@snapshot-nightly')), err: { code: 'ECONNRESET' } })],
  ['nested conflicting message', JSON.stringify({ ...JSON.parse(missingVersion('@scope/a@snapshot-nightly')), err: { message: '401 Unauthorized' } })],
  ['underlying network cause', JSON.stringify({ ...JSON.parse(missingVersion('@scope/a@snapshot-nightly')), cause: { code: 'ECONNRESET' } })],
  ['mixed error message', JSON.stringify({ ...JSON.parse(missingVersion('@scope/a@snapshot-nightly')), message: `${JSON.parse(missingVersion('@scope/a@snapshot-nightly')).message}\n401 Unauthorized` })],
  ['plain text', 'ERR_PNPM_NO_MATCHING_VERSION: No matching version found for @scope/a@snapshot-nightly'],
  ['unknown schema', JSON.stringify({ error: 'ERR_PNPM_NO_MATCHING_VERSION' })],
])('does not retry %s failures', async (_name, stderr) => {
  const h = await consumerFixture()
  h.install.mockReturnValue(completed(stderr))
  await expect(verifyNightlyConsumer(h.report, h.options)).rejects.toThrow('failed')
  expect(h.install).toHaveBeenCalledTimes(1)
  expect(h.sleep).not.toHaveBeenCalled()
  expect(h.report.consumer?.status).toBe('failed')
})

it('does not retry process timeouts even with a missing-version error in partial output', async () => {
  const h = await consumerFixture()
  h.install.mockReturnValue({ ...completed(missingVersion('@scope/a@snapshot-nightly')), error: new Error('ETIMEDOUT') })
  await expect(verifyNightlyConsumer(h.report, h.options)).rejects.toThrow('ETIMEDOUT')
  expect(h.install).toHaveBeenCalledTimes(1)
  expect(h.sleep).not.toHaveBeenCalled()
})

it('preserves pkg.pr.new single-attempt behavior independently of npm visibility settings', async () => {
  const h = await consumerFixture({ provider: 'pkg-pr-new' })
  h.options.config = { registry: { visibilityTimeoutMs: 1 } }
  h.install.mockReturnValue(completed(missingVersion('@scope/a@snapshot-nightly')))
  await expect(verifyNightlyConsumer(h.report, h.options)).rejects.toThrow('failed')
  expect(h.install).toHaveBeenCalledTimes(1)
  expect(Number(h.install.mock.calls[0]?.[1].timeout)).toBeGreaterThan(590_000)
  expect(h.sleep).not.toHaveBeenCalled()
})

it('never retries installed identity mismatches after installation visibility recovers', async () => {
  const h = await consumerFixture({ mutate: (manifest) => {
    manifest['version'] = '0.0.0'
  } })
  h.install.mockReturnValueOnce(completed(missingVersion('@scope/a@snapshot-nightly')))
  await expect(verifyNightlyConsumer(h.report, h.options)).rejects.toThrow('unexpected version or identity')
  expect(h.install).toHaveBeenCalledTimes(2)
  expect(h.sleep).toHaveBeenCalledTimes(1)
  expect(h.spawn.mock.calls.some(([, args]) => args.includes('--eval'))).toBe(false)
})

it('never retries entry failures after installation visibility recovers', async () => {
  const h = await consumerFixture({ escapeBin: true })
  h.install.mockReturnValueOnce(completed(missingVersion('@scope/a@snapshot-nightly')))
  await expect(verifyNightlyConsumer(h.report, h.options)).rejects.toThrow('outside its isolated package')
  expect(h.install).toHaveBeenCalledTimes(2)
  expect(h.sleep).toHaveBeenCalledTimes(1)
})
