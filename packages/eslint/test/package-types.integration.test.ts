import path from 'node:path'
import ts from 'typescript'

const packages = [
  { directory: 'changelog-github', name: '@icebreakers/changelog-github', esmTypes: 'dist/index.d.ts', cjsTypes: 'dist/index.d.cts' },
  { directory: 'commitlint', name: '@icebreakers/commitlint-config', esmTypes: 'dist/index.d.ts', cjsTypes: 'dist/index.d.cts' },
  { directory: 'eslint', name: '@icebreakers/eslint-config', esmTypes: 'index.d.ts', cjsTypes: 'dist/index.d.cts' },
  { directory: 'eslint', name: '@icebreakers/eslint-config/stylelint', esmTypes: 'dist/stylelint.d.ts', cjsTypes: 'dist/stylelint.d.cts' },
]

it.each(packages)('resolves $name declarations in the same module format as each runtime entry', (pkg) => {
  const directory = path.resolve(import.meta.dirname, '../../', pkg.directory)
  for (const [extension, mode, target] of [
    ['mts', ts.ModuleKind.ESNext, pkg.esmTypes],
    ['cts', ts.ModuleKind.CommonJS, pkg.cjsTypes],
  ] as const) {
    const resolved = ts.resolveModuleName(
      pkg.name,
      path.join(directory, `test/consumer.${extension}`),
      { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext },
      ts.sys,
      undefined,
      undefined,
      mode,
    ).resolvedModule
    expect(resolved && path.normalize(resolved.resolvedFileName)).toBe(path.join(directory, target))
    expect(resolved?.packageId?.name).toBe(pkg.name.replace(/\/stylelint$/u, ''))
  }
})
