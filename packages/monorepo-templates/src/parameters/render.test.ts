import type { TemplateParameterManifest, TemplateSnapshot } from '../..'
import { Buffer } from 'node:buffer'
import { expect, it } from 'vitest'
import { parseTemplateParameterManifest, renderTemplateParameters, resolveTemplateParameters } from '../..'

const source: TemplateSnapshot = { schemaVersion: 1, directories: ['test'], files: [
  { path: 'binary.png', content: Buffer.from([0, 255, 123, 123]).toString('base64'), executable: false },
  { path: 'label.ts', content: Buffer.from('export const label = {{repoctl-json:label}}\n').toString('base64'), executable: false },
  { path: 'package.json', content: Buffer.from('{"name":"sample","version":"1.0.0"}').toString('base64'), executable: false },
  { path: 'repoctl.template.json', content: Buffer.from('{}').toString('base64'), executable: false },
  { path: 'secret.env', content: Buffer.from('TOKEN={{repoctl:token}}\n').toString('base64'), executable: false },
  { path: 'test/index.test.ts', content: Buffer.from('test code').toString('base64'), executable: false },
] }
const manifest: TemplateParameterManifest = {
  schemaVersion: 1,
  parameters: { label: { type: 'string', default: 'sample' }, test: { type: 'boolean', default: false }, token: { type: 'string', sensitive: true } },
  interpolate: ['label.ts', 'secret.env', 'binary.png'],
  conditions: [{ when: { parameter: 'test', equals: true }, files: ['test'], package: { scripts: { test: 'vitest run' }, devDependencies: { vitest: '5.0.3' } } }],
}

it('bounds repeated substitutions before allocating an oversized rendered file', () => {
  const contract: TemplateParameterManifest = { schemaVersion: 1, parameters: { token: { type: 'string', sensitive: true } }, interpolate: ['output.txt'] }
  const repeated: TemplateSnapshot = { schemaVersion: 1, directories: [], files: [{ path: 'output.txt', content: Buffer.from('{{repoctl:token}}'.repeat(1024)).toString('base64'), executable: false }] }
  const parameters = resolveTemplateParameters(contract.parameters, { token: 'private'.repeat(9000) })
  expect(() => renderTemplateParameters(repeated, contract, parameters)).toThrow('rendered snapshot exceeds 32 MiB')
})

it('renders both combinations with one file/script/dependency condition and preserves binary bytes', () => {
  for (const enabled of [false, true]) {
    const parameters = resolveTemplateParameters(manifest.parameters, { label: 'quoted "value"', test: enabled, token: 'private-value' })
    const rendered = renderTemplateParameters(source, parseTemplateParameterManifest(manifest), parameters)
    const files = new Map(rendered.snapshot.files.map(file => [file.path, Buffer.from(file.content, 'base64')]))
    expect(files.has('test/index.test.ts')).toBe(enabled)
    expect(rendered.snapshot.directories.includes('test')).toBe(enabled)
    expect(files.has('repoctl.template.json')).toBe(false)
    expect(files.get('binary.png')).toEqual(Buffer.from([0, 255, 123, 123]))
    expect(files.get('label.ts')?.toString()).toBe(`export const label = ${JSON.stringify('quoted "value"')}\n`)
    const pkg = JSON.parse(files.get('package.json')!.toString())
    expect(pkg.scripts?.test).toBe(enabled ? 'vitest run' : undefined)
    expect(pkg.devDependencies?.vitest).toBe(enabled ? '5.0.3' : undefined)
    expect(rendered.sensitivePaths).toEqual(['secret.env'])
    expect(JSON.stringify([rendered.files, rendered.package, parameters.report, parameters.retained])).not.toContain('private-value')
  }
})

it('rejects conditions that use secrets, expressions, missing files or base-owned package entries', () => {
  expect(() => parseTemplateParameterManifest({ ...manifest, conditions: [{ when: { parameter: 'token', equals: 'secret' }, files: ['secret.env'] }] })).toThrow('nonsensitive')
  expect(() => parseTemplateParameterManifest({ ...manifest, interpolate: ['../escape'] })).toThrow()
  expect(() => parseTemplateParameterManifest({ ...manifest, conditions: [{ when: { expression: 'process.exit()' }, files: ['test'] }] })).toThrow()
  const values = resolveTemplateParameters(manifest.parameters, { token: 'private-value' })
  expect(() => renderTemplateParameters(source, { ...manifest, interpolate: ['missing.ts'] }, values)).toThrow('declared file does not exist')
  expect(() => renderTemplateParameters(source, { ...manifest, conditions: [{ when: { parameter: 'test', equals: false }, package: { scripts: { test: '{{repoctl:token}}' } } }] }, values)).toThrow('sensitive inputs cannot enter package metadata')
  const pkgSource = { ...source, files: source.files.map(file => file.path === 'package.json' ? { ...file, content: Buffer.from('{"scripts":{"test":"existing"}}').toString('base64') } : file) }
  expect(() => renderTemplateParameters(pkgSource, manifest, values)).toThrow('absent from the base manifest')
})
