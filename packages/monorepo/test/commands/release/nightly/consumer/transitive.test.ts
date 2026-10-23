import { expect, it } from 'vitest'
import { verifyNightlyConsumer } from '../../../../../src/commands/release/nightly/consumer'
import { completed, consumerFixture } from './fixture'

interface DependencyParent { name: string, version: string }

function transitiveFailure(reference: string, parent: DependencyParent | DependencyParent[], overrides: Record<string, unknown> = {}) {
  const parents = Array.isArray(parent) ? parent : [parent]
  return JSON.stringify({
    name: 'pnpm',
    level: 'error',
    code: 'ERR_PNPM_NO_MATCHING_VERSION',
    message: `No matching version found for ${reference} while fetching it from https://registry.npmjs.org/\n\nFailed to resolve ${reference}${parents.map(pkg => `\nThis error happened while installing the dependencies of ${pkg.name}@${pkg.version}`).join('')}`,
    pkgsStack: parents.map(pkg => ({ id: `${pkg.name}@${pkg.version}`, name: pkg.name, version: pkg.version })),
    ...overrides,
  })
}

it.each(['exact version', 'unscoped alias', 'scoped alias'])(
  'retries pnpm 12 transitive visibility failures for a batch %s',
  async (kind) => {
    const h = await consumerFixture()
    const target = h.report.packages[0]!
    const parent = h.report.packages[1]!
    const reference = kind === 'exact version'
      ? `${target.name}@${target.version}`
      : `${kind === 'scoped alias' ? '@scope/aliased' : 'aliased'}@npm:${target.name}@${target.version}`
    const stderr = transitiveFailure(reference, parent)
    h.install.mockReturnValueOnce(completed(stderr))

    await verifyNightlyConsumer(h.report, h.options)

    expect(h.install).toHaveBeenCalledTimes(2)
    expect(h.sleep.mock.calls.map(([delay]) => delay)).toEqual([2_000])
    expect(h.report.consumer?.status).toBe('verified')
    expect(h.report.consumer?.commands.filter(command => command.args.includes('install')).map(command => command.exitCode)).toEqual([1, 0])
    expect(h.report.consumer?.commands[1]?.stderr).toBe(stderr)
    expect(h.report.confirmed).toBe(true)
    expect(h.spawn.mock.calls.some(([, args]) => args.includes('publish'))).toBe(false)
  },
)

it('matches every pnpm 12 dependency annotation to its ordered package stack', async () => {
  const h = await consumerFixture()
  const target = h.report.packages[0]!
  const parents = [h.report.packages[1]!, { name: '@scope/outer-parent', version: '2.0.0' }]
  h.install.mockReturnValueOnce(completed(transitiveFailure(`${target.name}@${target.version}`, parents)))

  await verifyNightlyConsumer(h.report, h.options)

  expect(h.install).toHaveBeenCalledTimes(2)
  expect(h.report.consumer?.status).toBe('verified')
})

it('retains pnpm 11 compatibility when dependency context is only in the structured stack', async () => {
  const h = await consumerFixture()
  const target = h.report.packages[0]!
  const record = JSON.parse(transitiveFailure(`${target.name}@${target.version}`, h.report.packages[1]!))
  record.message = `No matching version found for ${target.name}@${target.version} while fetching it from https://registry.npmjs.org/`
  h.install.mockReturnValueOnce(completed(JSON.stringify(record)))
  await verifyNightlyConsumer(h.report, h.options)
  expect(h.install).toHaveBeenCalledTimes(2)
  expect(h.report.consumer?.status).toBe('verified')
})

it('retains bounded installation retries across multiple transitive batch misses', async () => {
  const h = await consumerFixture()
  const [target, parent] = h.report.packages
  h.install.mockReturnValueOnce(completed(transitiveFailure(`${target!.name}@${target!.version}`, parent!)))
    .mockReturnValueOnce(completed(transitiveFailure(`${parent!.name}@${parent!.version}`, target!)))

  await verifyNightlyConsumer(h.report, h.options)

  expect(h.report.consumer?.status).toBe('verified')
  expect(h.install).toHaveBeenCalledTimes(3)
  expect(h.sleep.mock.calls.map(([delay]) => delay)).toEqual([2_000, 4_000])
})

it.each([
  ['null', null],
  ['empty stack', []],
  ['object', {}],
  ['null parent', [null]],
  ['missing version', [{ name: 'parent' }]],
  ['non-string version', [{ name: 'parent', version: 1 }]],
])('rejects malformed dependency context %s', async (_name, pkgsStack) => {
  const h = await consumerFixture()
  const target = h.report.packages[0]!
  h.install.mockReturnValue(completed(transitiveFailure(`${target.name}@${target.version}`, h.report.packages[1]!, { pkgsStack })))
  await expect(verifyNightlyConsumer(h.report, h.options)).rejects.toThrow('failed')
  expect(h.install).toHaveBeenCalledTimes(1)
  expect(h.sleep).not.toHaveBeenCalled()
})

it.each([
  { name: 'parent\n401 Unauthorized', version: '1.0.0' },
  { name: 'parent', version: '1.0.0\rECONNRESET' },
])('rejects control characters in dependency context %j', async (parent) => {
  const h = await consumerFixture()
  const target = h.report.packages[0]!
  h.install.mockReturnValue(completed(transitiveFailure(`${target.name}@${target.version}`, parent)))
  await expect(verifyNightlyConsumer(h.report, h.options)).rejects.toThrow('failed')
  expect(h.install).toHaveBeenCalledTimes(1)
  expect(h.sleep).not.toHaveBeenCalled()
})

it.each([
  'external package',
  'external alias target',
  'old batch version',
  'old aliased batch version',
  'mixed authentication record',
  'mixed network record',
  'nested network cause',
  'missing dependency stack',
  'mismatched dependency stack',
  'reordered dependency stack',
  'authentication message suffix',
  'unknown message suffix',
  'unknown output suffix',
])('does not retry a transitive failure with %s', async (reason) => {
  const h = await consumerFixture()
  const target = h.report.packages[0]!
  const parent = h.report.packages[1]!
  let reference = `${target.name}@${target.version}`
  if (reason === 'external package') {
    reference = `external@${target.version}`
  }
  else if (reason === 'external alias target') {
    reference = `${target.name}@npm:external@${target.version}`
  }
  else if (reason === 'old batch version') {
    reference = `${target.name}@1.0.0`
  }
  else if (reason === 'old aliased batch version') {
    reference = `aliased@npm:${target.name}@1.0.0`
  }
  let stderr = transitiveFailure(reference, parent)
  if (reason === 'mixed authentication record' || reason === 'mixed network record') {
    const code = reason === 'mixed authentication record' ? 'ERR_PNPM_FETCH_401' : 'ERR_PNPM_FETCH_ERROR'
    stderr += `\n${JSON.stringify({ name: 'pnpm', level: 'error', code, message: 'Additional registry failure' })}`
  }
  else if (reason === 'nested network cause') {
    stderr = transitiveFailure(reference, parent, { cause: { code: 'ECONNRESET' } })
  }
  else if (reason === 'missing dependency stack') {
    stderr = transitiveFailure(reference, parent, { pkgsStack: undefined })
  }
  else if (reason === 'mismatched dependency stack') {
    stderr = transitiveFailure(reference, parent, { pkgsStack: [{ id: `${parent.name}@1.0.0`, name: parent.name, version: '1.0.0' }] })
  }
  else if (reason === 'reordered dependency stack') {
    const outer = { name: '@scope/outer-parent', version: '2.0.0' }
    stderr = transitiveFailure(reference, [parent, outer], { pkgsStack: [outer, parent] })
  }
  else if (reason === 'authentication message suffix') {
    const record = JSON.parse(stderr)
    stderr = JSON.stringify({ ...record, message: `${record.message}\n401 Unauthorized` })
  }
  else if (reason === 'unknown message suffix') {
    const record = JSON.parse(stderr)
    stderr = JSON.stringify({ ...record, message: `${record.message}\nUnexpected additional failure` })
  }
  else if (reason === 'unknown output suffix') {
    stderr += '\nUnexpected additional failure'
  }
  h.install.mockReturnValue(completed(stderr))

  await expect(verifyNightlyConsumer(h.report, h.options)).rejects.toThrow('failed')

  expect(h.install).toHaveBeenCalledTimes(1)
  expect(h.sleep).not.toHaveBeenCalled()
  expect(h.report.consumer?.status).toBe('failed')
  expect(h.report.confirmed).toBe(true)
})
