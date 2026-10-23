import { checkEnvironmentCache } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { fixture } from './fixture'

for (const extension of ['d.ts', 'd.mts', 'd.cts']) {
  it(`parses valid ambient ${extension} declarations without false source warnings`, async (t) => {
    const h = await fixture(t)
    await h.write(`packages/app/src/api.${extension}`, 'export const sayHello: () => string\n')
    const report = await checkEnvironmentCache(h.root)
    expect(report.status).toBe('pass')
    expect(report.findings).toEqual([])
    expect(report.tasks[0]!.variables).toEqual([])
  })
}

it('keeps ordinary TypeScript implementation parsing strict for a missing const initializer', async (t) => {
  const h = await fixture(t)
  await h.write('packages/app/src/api.ts', 'export const sayHello: () => string\n')
  const report = await checkEnvironmentCache(h.root)
  expect(report.findings).toContainEqual(expect.objectContaining({ rule: 'env-source-unparsed', path: 'packages/app/src/api.ts' }))
  expect(report.status).toBe('warn')
})
