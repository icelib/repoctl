import path from 'node:path'
import ts from 'typescript'

const consumer = `
import { icebreaker, parserPlain } from '@icebreakers/eslint-config'
import type { TypedFlatConfigItem } from '@icebreakers/eslint-config'

type Rules = NonNullable<TypedFlatConfigItem['rules']>
type ValidTitle = Rules['test/valid-title']
const flags: ValidTitle = ['error', { ignoreTypeOfDescribeName: true, allowArguments: false, disallowedWords: ['bad'] }]
const patterns: ValidTitle = ['error', { mustMatch: ['^works', 'explanation'], mustNotMatch: '^fails' }]
const matchers: ValidTitle = ['error', { mustMatch: { describe: '^group', test: ['^test'], it: ['^does', 'explanation'] } }]
// @ts-expect-error Boolean options must remain boolean.
const invalidFlag: ValidTitle = ['error', { allowArguments: 'yes' }]
// @ts-expect-error The rule schema does not permit unknown options.
const invalidOption: ValidTitle = ['error', { unsupported: 'pattern' }]
// @ts-expect-error Matchers are limited to the test function names in the schema.
const invalidMatcher: ValidTitle = ['error', { mustMatch: { suite: 'pattern' } }]
// @ts-expect-error A matcher tuple contains at most a pattern and explanation.
const invalidTuple: ValidTitle = ['error', { mustMatch: ['a', 'b', 'c'] }]
const curly: Rules['curly'] = ['error', 'multi-line', 'consistent']
// @ts-expect-error Other bundled rule option types must remain checked.
const invalidCurly: Rules['curly'] = ['error', 'sometimes']
icebreaker({ formatters: { css: 'oxfmt' }, rules: { 'test/valid-title': flags } })
parserPlain.parseForESLint('')
`

it.each(['mts', 'cts'])('checks strict built %s declarations with the supported installed ESLint peer', (extension) => {
  const filename = path.resolve(import.meta.dirname, `consumer.${extension}`)
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ESNext,
    strict: true,
    noEmit: true,
    skipLibCheck: false,
    types: [],
  }
  const peer = ts.resolveModuleName('eslint', filename, options, ts.sys).resolvedModule
  expect(peer).toBeDefined()
  // eslint-flat-config-utils omits its ESLint peer, so the source pnpm store finds an
  // unrelated @types/eslint 7 first. Bind the supported installed peer for this type
  // contract; isolated tarball consumer checks separately exercise default resolution.
  options.paths = { eslint: [peer!.resolvedFileName] }
  const host = ts.createCompilerHost(options)
  const getSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => path.normalize(fileName) === filename
    ? ts.createSourceFile(fileName, consumer, languageVersion, true)
    : getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile)
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([filename], options, host))
  expect(ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: fileName => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  })).toBe('')
})
