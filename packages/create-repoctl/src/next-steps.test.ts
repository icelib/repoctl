import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatNextSteps } from './next-steps'

describe('formatNextSteps', () => {
  it('enables Corepack before installing the workspace dependencies', () => {
    const output = formatNextSteps(path.join('/workspace', 'demo'), '/workspace')

    expect(output).toContain('\n  corepack enable\n  pnpm install\n')
    expect(output.indexOf('corepack enable')).toBeLessThan(output.indexOf('pnpm install'))
  })
})
