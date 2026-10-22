import type { CopyOptionsFn, TsdownHooks } from 'tsdown'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

export const antfuDeclarationVersion = '9.5.1'

const validTitle = `type TestValidTitle = [] | [{
  ignoreTypeOfDescribeName?: boolean;
  allowArguments?: boolean;
  disallowedWords?: string[];
  [k: string]: (string | [string] | [string, string] | {
    [k: string]: (string | [string] | [string, string]) | undefined;
  });
}];`

const booleanObject = `interface _UnicornNameReplacements_BooleanObject {
  [k: string]: boolean | undefined;
}`

// Mirrors @vitest/eslint-plugin's valid-title schema, including additionalProperties: false.
const correctedValidTitle = `type TestValidTitlePattern = string | [string] | [string, string];
type TestValidTitleMatchers = Partial<Record<'describe' | 'test' | 'it', TestValidTitlePattern>>;
type TestValidTitle = [] | [{
  ignoreTypeOfDescribeName?: boolean;
  allowArguments?: boolean;
  disallowedWords?: string[];
  mustMatch?: TestValidTitlePattern | TestValidTitleMatchers;
  mustNotMatch?: TestValidTitlePattern | TestValidTitleMatchers;
}];`

/** Repair only the reviewed upstream signatures; dependency upgrades require a new review. */
export function correctAntfuDeclarations(source: string, version: string) {
  if (version !== antfuDeclarationVersion) {
    throw new Error(`Review the @antfu/eslint-config declaration workaround before upgrading from ${antfuDeclarationVersion} to ${version}.`)
  }
  if (source.split(validTitle).length !== 2
    || source.split(booleanObject).length !== 3
    || !source.includes(`${booleanObject}\n${booleanObject}`)) {
    throw new Error('The reviewed @antfu/eslint-config declaration signatures changed; review or remove the workaround.')
  }
  return source
    .replace(validTitle, correctedValidTitle)
    .replace(`${booleanObject}\n${booleanObject}`, booleanObject)
}

async function readAntfuSource(directory: string) {
  const require = createRequire(path.join(directory, 'package.json'))
  const manifestPath = require.resolve('@antfu/eslint-config/package.json')
  const dependencyRoot = path.dirname(manifestPath)
  const [manifest, declaration, ownManifest] = await Promise.all([
    readFile(manifestPath, 'utf8'),
    readFile(path.join(dependencyRoot, 'dist/index.d.mts'), 'utf8'),
    readFile(path.join(directory, 'package.json'), 'utf8'),
  ])
  const { version } = JSON.parse(manifest) as { version: string }
  if (JSON.parse(ownManifest).dependencies['@antfu/eslint-config'] !== antfuDeclarationVersion) {
    throw new Error('The reviewed @antfu/eslint-config declaration workaround requires an exact dependency version.')
  }
  correctAntfuDeclarations(declaration, version)
  return { version, dependencyRoot }
}

// tsdown assigns shared copies to one format, including single-format and watch builds.
export const antfuLicenseCopy: CopyOptionsFn = async ({ cwd }) => {
  const { dependencyRoot } = await readAntfuSource(cwd)
  return { from: path.join(dependencyRoot, 'LICENSE'), rename: 'ANTFU-LICENSE' }
}

/** Post-process both ESM and CJS declaration builds without modifying dependency files. */
export function antfuDeclarationHooks(): Partial<TsdownHooks> {
  return {
    'build:prepare': async ({ options }) => {
      await readAntfuSource(options.cwd)
    },
    'build:done': async ({ options, chunks }) => {
      const { version } = await readAntfuSource(options.cwd)
      const declarations = chunks.filter(chunk => /^index\.d\.(?:ts|cts)$/u.test(chunk.fileName))
      if (!declarations.length) {
        throw new Error('Expected bundled @antfu/eslint-config declarations in the ESLint package build.')
      }
      for (const chunk of declarations) {
        const filename = path.join(options.outDir, chunk.fileName)
        const source = await readFile(filename, 'utf8')
        const notice = `// Includes @antfu/eslint-config ${version} declarations (MIT); see ANTFU-LICENSE.\n`
        await writeFile(filename, notice + correctAntfuDeclarations(source, version))
      }
    },
  }
}
