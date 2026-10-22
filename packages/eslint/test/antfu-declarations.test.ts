import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { antfuDeclarationVersion, correctAntfuDeclarations } from '../declarations/antfu'

const require = createRequire(import.meta.url)
const dependencyRoot = path.dirname(require.resolve('@antfu/eslint-config/package.json'))

it('corrects only the reviewed upstream declaration defects', async () => {
  const upstream = await readFile(path.join(dependencyRoot, 'dist/index.d.mts'), 'utf8')
  const corrected = correctAntfuDeclarations(upstream, antfuDeclarationVersion)
  expect(corrected).toContain('Partial<Record<\'describe\' | \'test\' | \'it\', TestValidTitlePattern>>')
  expect(corrected).toContain('mustMatch?: TestValidTitlePattern | TestValidTitleMatchers;')
  expect(corrected).toContain('mustNotMatch?: TestValidTitlePattern | TestValidTitleMatchers;')
  expect(corrected.match(/interface _UnicornNameReplacements_BooleanObject/gu)).toHaveLength(1)
  expect(() => correctAntfuDeclarations(corrected, antfuDeclarationVersion)).toThrow('signatures changed')
})

it('requires review when the dependency version changes', () => {
  expect(() => correctAntfuDeclarations('', '9.5.2')).toThrow('before upgrading')
})

it.each(['type TestValidTitle =', 'interface _UnicornNameReplacements_BooleanObject'])('requires review when %s changes', async (signature) => {
  const upstream = await readFile(path.join(dependencyRoot, 'dist/index.d.mts'), 'utf8')
  expect(() => correctAntfuDeclarations(upstream.replace(signature, `${signature}Changed`), antfuDeclarationVersion))
    .toThrow('signatures changed')
})
