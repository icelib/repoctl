import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { expect, it } from 'vitest'

it.each(['@icebreakers/monorepo/docs-context', 'repoctl/docs-context'])('%s loads as a pure built subpath', (specifier) => {
  const loader = `
    export async function resolve(specifier, context, next) {
      if (specifier.startsWith('node:') || specifier === 'c12' || specifier === 'vitest' || specifier.startsWith('@octokit/')) {
        throw new Error('Unexpected docs-context dependency: ' + specifier)
      }
      return next(specifier, context)
    }
  `
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { register } from 'node:module'
    register(${JSON.stringify(`data:text/javascript,${encodeURIComponent(loader)}`)}, import.meta.url)
    const { resolveDocsContext } = await import(${JSON.stringify(specifier)})
    console.log(resolveDocsContext({ previewOrigin: 'https://preview.example.com', stableOrigin: 'https://docs.example.com' }).channel)
  `], { encoding: 'utf8', cwd: new URL('../../../../', import.meta.url), timeout: 30_000 })
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout.trim()).toBe('preview')
})
