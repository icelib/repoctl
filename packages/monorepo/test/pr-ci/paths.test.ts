import { expect, it } from 'vitest'
import { validationPaths } from '../../../../.github/pr-ci/paths.mjs'

it('preserves CI ignored paths while keeping release intent verification separate', () => {
  expect(validationPaths(['README.md', 'docs/setup.txt', '.changeset/fix.md', 'LICENSE'])).toEqual({ run_ci: false, run_devcontainer: false })
  expect(validationPaths(['packages/demo/src/index.ts'])).toEqual({ run_ci: true, run_devcontainer: false })
})

it('preserves Dev Container paths including dependencies and template maintenance', () => {
  for (const filename of ['pnpm-lock.yaml', 'templates/tsdown/src/index.ts', 'templates/nimbus/src/index.ts', 'scripts/nimbus/check-upgrade.mjs', 'packages/monorepo/src/core/operation-lock/index.ts']) {
    expect(validationPaths([filename])).toEqual({ run_ci: true, run_devcontainer: true })
  }
})

it('detects paths renamed out of a relevant directory', () => {
  expect(validationPaths([{ filename: 'docs/removed.md', previous_filename: 'templates/tsdown/src/index.ts' }])).toEqual({ run_ci: true, run_devcontainer: true })
})

it('runs all checks when GitHub truncates the changed file list', () => {
  expect(validationPaths([{ filename: 'README.md' }], 3001)).toEqual({ run_ci: true, run_devcontainer: true })
})
