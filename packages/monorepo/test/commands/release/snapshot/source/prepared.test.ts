import { createSnapshotBuildPlan, prepareSnapshot } from '@icebreakers/monorepo'
import { expect, it, vi } from 'vitest'
import { bundle } from '../prepared/fixture'

it('rejects programmatic source extensions before frozen prepared snapshots inspect or build any candidate', async () => {
  const h = bundle()
  const prepareSource = vi.fn(async () => ({ files: [] }))
  for (const extension of [{ referenceGitlinks: ['references/compiler'] }, { prepareSource }]) {
    await expect(createSnapshotBuildPlan({ cwd: 'nonexistent-candidate', source: h.plan.source, ...extension })).rejects.toThrow('outside the frozen plan')
    await expect(prepareSnapshot({ cwd: 'nonexistent-candidate', plan: h.plan, outputDirectory: 'nonexistent-output', ...extension })).rejects.toThrow('outside the frozen plan')
  }
  expect(prepareSource).not.toHaveBeenCalled()
})
