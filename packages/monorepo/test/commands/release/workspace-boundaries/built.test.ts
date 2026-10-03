import { readFile } from 'node:fs/promises'
import { createReleasePlan, releaseCi } from '@icebreakers/monorepo'
import path from 'pathe'
import { expect, it } from 'vitest'
import { snapshot } from '../plan/fixture'
import { expectAppliedPlan, workspaceFixture } from './fixture'

it.each([
  { reference: 'root-pkg', privateRoot: true, mode: 'prepare' as const },
  { reference: './', privateRoot: false, mode: 'auto' as const },
])('applies explicit root $reference and private intents through $mode without requiring their notes', async ({ reference, privateRoot, mode }) => {
  const h = await workspaceFixture({ privateRoot, removeNotes: ['.', 'packages/private-lib'] })
  await h.write('.changeset/test.md', `---\n'${reference}': minor\nprivate-lib: minor\na: patch\n---\nRelease workspace changes.\n`)
  const before = await snapshot(h.cwd)
  const plan = await createReleasePlan(h.options)
  expect(plan.status, JSON.stringify(plan.blockers)).toBe('ready')
  expect(plan.packages.find(pkg => pkg.name === 'root-pkg')).toMatchObject({
    directory: '.',
    private: privateRoot,
    publishCandidate: false,
    newVersion: '1.1.0',
  })
  expect(plan.packages.find(pkg => pkg.name === 'private-lib')).toMatchObject({ private: true, publishCandidate: false, newVersion: '1.1.0' })
  expect(await snapshot(h.cwd)).toEqual(before)

  await releaseCi({ ...h.options, mode })

  await expectAppliedPlan(h, plan)
  expect(h.github.ensurePullRequest).toHaveBeenCalledOnce()
  const body = h.github.ensurePullRequest.mock.calls[0]![0].body
  expect(body).toContain('| `a` |')
  expect(body).not.toContain('root-pkg')
  expect(body).not.toContain('private-lib')
  await expect(readFile(path.join(h.cwd, 'CHANGELOG.md'))).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(readFile(path.join(h.cwd, 'packages/private-lib/CHANGELOG.md'))).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(readFile(path.join(h.cwd, '.changeset/test.md'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(h.pushes).toHaveLength(1)
  expect((await createReleasePlan(h.options)).status).toBe('empty')
}, 60_000)

it('keeps private dependency propagation identical in preview and preparation', async () => {
  const h = await workspaceFixture({ removeNotes: ['packages/private-lib'] })
  await h.write('.changeset/test.md', '---\na: patch\n---\nShip the public package.\n')
  const plan = await createReleasePlan(h.options)
  expect(plan.status, JSON.stringify(plan.blockers)).toBe('ready')
  expect(plan.packages.find(pkg => pkg.name === 'private-lib')).toMatchObject({
    private: true,
    publishCandidate: false,
    reasons: ['dependencies'],
    intents: [],
  })

  await releaseCi({ ...h.options, mode: 'prepare' })

  await expectAppliedPlan(h, plan)
  expect(h.github.ensurePullRequest).toHaveBeenCalledOnce()
  const body = h.github.ensurePullRequest.mock.calls[0]![0].body
  expect(body).toContain('Ship the public package.')
  expect(body).not.toContain('private-lib')
}, 60_000)

it('consumes a private-only intent and opens its version PR without npm links', async () => {
  const h = await workspaceFixture({ removeNotes: ['packages/private-lib'] })
  await h.write('.changeset/test.md', '---\nprivate-lib: patch\n---\nUpdate the internal app.\n')
  const plan = await createReleasePlan(h.options)
  expect(plan.status, JSON.stringify(plan.blockers)).toBe('ready')
  expect(plan.packages.map(pkg => pkg.name)).toEqual(['private-lib'])

  await releaseCi({ ...h.options, mode: 'auto' })

  await expectAppliedPlan(h, plan)
  expect(h.github.ensurePullRequest).toHaveBeenCalledOnce()
  expect(h.github.ensurePullRequest.mock.calls[0]![0].body).not.toContain('npmjs.com')
  expect(h.github.ensureRelease).not.toHaveBeenCalled()
  await expect(readFile(path.join(h.cwd, '.changeset/test.md'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect((await createReleasePlan(h.options)).status).toBe('empty')
}, 60_000)

it('still rejects a public release whose changelog is absent before any push', async () => {
  const h = await workspaceFixture({ removeNotes: ['packages/a'] })
  await h.write('.changeset/test.md', '---\na: patch\n---\nShip the public package.\n')

  await expect(releaseCi({ ...h.options, mode: 'prepare' })).rejects.toThrow('Missing release notes for a@1.0.1')

  expect(h.applied.some(pkg => pkg.name === 'a')).toBe(true)
  expect(h.pushes).toEqual([])
  expect(h.github.ensurePullRequest).not.toHaveBeenCalled()
}, 60_000)
