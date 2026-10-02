import { describe, expect, it } from 'vitest'
import { compareManifest } from '@/commands/doctor/installation/lockfile'

const entry = (specifier: string) => ({ specifier, version: '1.0.0' })

describe('manifest and lockfile comparison', () => {
  it('resolves default and named catalogs before checking manifest changes', () => {
    const workspace = { catalog: { a: '^1.0.0' }, catalogs: { tools: { b: '~2.0.0' } } }
    const manifest = { dependencies: { a: 'catalog:', b: 'catalog:tools' } }
    const importer = { dependencies: { a: entry('catalog:'), b: entry('catalog:tools') } }
    const lockfile = { catalogs: { default: { a: entry('^1.0.0') }, tools: { b: entry('~2.0.0') } } }
    expect(compareManifest(manifest, importer, workspace, lockfile)).toEqual({ mismatches: [], unknown: [] })
    workspace.catalog.a = '^3.0.0'
    expect(compareManifest(manifest, importer, workspace, lockfile).mismatches).toEqual(['dependencies.a'])
  })

  it('handles workspace protocols, removed dependencies, and auto-installed peers', () => {
    const manifest = { dependencies: { a: 'workspace:*' }, peerDependencies: { peer: '^1' } }
    const importer = { dependencies: { a: entry('workspace:*'), old: entry('^1'), peer: entry('^1') } }
    expect(compareManifest(manifest, importer, {}, {}).mismatches).toEqual(['dependencies.old (removed)'])
  })

  it('uses explicit dependency groups before auto-installed peer dependencies', () => {
    const manifest = { peerDependencies: { dep: '^1' }, devDependencies: { dep: '^2' } }
    const importer = { devDependencies: { dep: entry('^2') } }
    expect(compareManifest(manifest, importer, {}, { settings: { autoInstallPeers: true } })).toEqual({ mismatches: [], unknown: [] })
    expect(compareManifest({ peerDependencies: { dep: '^1' } }, {}, {}, { settings: { autoInstallPeers: false } })).toEqual({ mismatches: [], unknown: [] })
  })

  it('does not treat malformed dependency maps as a proven mismatch', () => {
    expect(compareManifest({ dependencies: { a: '^1' } }, { dependencies: 'unsupported' }, {}, {})).toEqual({
      mismatches: [],
      unknown: ['dependencies (unsupported dependency map)'],
    })
  })

  it('preserves uncertainty for unsupported entries, unresolved catalogs, and overrides', () => {
    const manifest = { dependencies: { a: 'catalog:missing', b: '^1', c: '^1' } }
    const importer = { dependencies: { a: entry('catalog:missing'), b: '1.0.0', c: entry('^2') } }
    expect(compareManifest(manifest, importer, { overrides: { c: '^2' } }, {})).toEqual({
      mismatches: [],
      unknown: ['dependencies.a', 'dependencies.b', 'dependencies.c (override)'],
    })
  })
})
