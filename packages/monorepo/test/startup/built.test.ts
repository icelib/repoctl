import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { expect, it } from 'vitest'

// Check dependency boundaries instead of flaky elapsed-time thresholds. These
// are real Node processes importing the same built artifacts delivered to users.
it.each(['index', 'tooling-entry', 'cli'])('%s starts without loading unused lint plugins, test runners or installer internals', (entry) => {
  const target = new URL(`../../dist/${entry}.mjs`, import.meta.url).href
  const forbidden = ['@icebreakers/eslint-config', '@pnpm/workspace.find-packages', '@pnpm/cli-utils', '@pnpm/store-connection-manager', 'vitest/config']
  const loader = `
    const forbidden = ${JSON.stringify(forbidden)}
    export async function resolve(specifier, context, next) {
      if (forbidden.includes(specifier)) throw new Error('Unexpected startup dependency: ' + specifier)
      return next(specifier, context)
    }
  `
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import Module, { register } from 'node:module'
    const forbidden = ${JSON.stringify(forbidden)}
    const load = Module._load
    Module._load = function(specifier, ...args) {
      if (forbidden.includes(specifier)) throw new Error('Unexpected startup dependency: ' + specifier)
      return load.call(this, specifier, ...args)
    }
    register(${JSON.stringify(`data:text/javascript,${encodeURIComponent(loader)}`)}, import.meta.url)
    process.argv = [process.execPath, 'repoctl', '--help']
    await import(${JSON.stringify(target)})
    console.log('startup boundary passed')
  `], { encoding: 'utf8', timeout: 30_000 })
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain(entry === 'cli' ? 'repoctl' : 'startup boundary passed')
})
