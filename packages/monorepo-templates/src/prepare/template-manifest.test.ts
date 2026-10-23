import { expect, it } from 'vitest'
import { sanitizeTemplateManifest } from './template-manifest'

it.each(['astro', 'vitepress'])('publishes installable %s helpers while retaining template scripts and registry dependencies', (engine) => {
  const source = {
    name: 'docs',
    scripts: { dev: `${engine} dev`, build: `${engine} build`, preview: `${engine} preview` },
    devDependencies: { repoctl: 'workspace:*', typescript: '^6.0.3' },
    dependencies: { [engine]: '1.0.0' },
  }
  const content = sanitizeTemplateManifest(JSON.stringify(source))
  expect(JSON.parse(content)).toEqual({ ...source, devDependencies: { repoctl: 'latest', typescript: '^6.0.3' } })
  expect(sanitizeTemplateManifest(content)).toBe(content)
  expect(sanitizeTemplateManifest(JSON.stringify({ devDependencies: { repoctl: '^6.0.1' } }))).toContain('^6.0.1')
})

it.each(['workspace:*', 'workspace:^', 'file:../local', 'link:../local', 'catalog:'])('rejects unreviewed source-local dependencies (%s)', (version) => {
  expect(() => sanitizeTemplateManifest(JSON.stringify({ dependencies: { unknown: version } }))).toThrow('unsupported source-local dependency')
})
