import type { WorkspaceManifestLike } from '@/commands/upgrade/workspace'
import { describe, expect, it } from 'vitest'
import { mergeWorkspaceManifest, normalizeWorkspaceManifest } from '@/commands/upgrade/workspace'

describe('mergeWorkspaceManifest', () => {
  it('keeps older pnpm build permissions and explicit denials in one format', () => {
    const merged = mergeWorkspaceManifest(
      normalizeWorkspaceManifest({ allowBuilds: { lefthook: true, esbuild: true, sharp: true } }),
      normalizeWorkspaceManifest({ onlyBuiltDependencies: ['esbuild'], ignoredBuiltDependencies: ['sharp'] }),
    )
    expect(merged.onlyBuiltDependencies).toEqual(['esbuild', 'lefthook'])
    expect(merged.ignoredBuiltDependencies).toEqual(['sharp'])
    expect(merged.allowBuilds).toBeUndefined()
  })

  it('adds missing workspace config without overriding existing values', () => {
    const source: WorkspaceManifestLike = normalizeWorkspaceManifest({
      packages: ['apps/*', 'packages/*', '!**/test/**'],
      onlyBuiltDependencies: ['esbuild', 'sharp'],
      catalogs: {
        default: {
          typescript: '5.5.0',
          vitest: '2.0.0',
        },
      },
    })
    const target: WorkspaceManifestLike = normalizeWorkspaceManifest({
      packages: ['apps/*'],
      onlyBuiltDependencies: ['sharp'],
      catalogs: {
        default: {
          typescript: '5.4.0',
        },
        custom: {
          eslint: '9.0.0',
        },
      },
    })

    const merged = mergeWorkspaceManifest(source, target)

    expect(merged.packages).toEqual(['apps/*', 'packages/*', '!**/test/**'])
    expect(merged.onlyBuiltDependencies).toEqual(['sharp', 'esbuild'])
    expect(merged.catalogs).toEqual({
      default: {
        typescript: '5.4.0',
        vitest: '2.0.0',
      },
      custom: {
        eslint: '9.0.0',
      },
    })
  })

  it('dedupes workspace globs regardless of wrapping quotes', () => {
    const merged = mergeWorkspaceManifest(
      normalizeWorkspaceManifest({ packages: ['apps/*', '!**/test/**'] }),
      normalizeWorkspaceManifest({ packages: [`'apps/*'`, `"!**/test/**"`] }),
    )

    expect(merged.packages).toEqual([`'apps/*'`, `"!**/test/**"`])
  })

  it('keeps target shapes when source types differ', () => {
    const merged = mergeWorkspaceManifest(
      normalizeWorkspaceManifest({ packages: ['apps/*'], hoist: true }),
      normalizeWorkspaceManifest({ packages: 'string-value', hoist: false }),
    ) as WorkspaceManifestLike & { hoist: boolean }

    expect(merged.packages).toBe('string-value')
    expect(merged.hoist).toBe(false)
  })
})
