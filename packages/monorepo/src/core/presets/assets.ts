import { presetRelativePath } from './files'

const rootAssets = new Set([
  '.editorconfig',
  '.gitattributes',
  '.gitignore',
  '.npmrc',
  'commitlint.config.cjs',
  'commitlint.config.js',
  'commitlint.config.mjs',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.ts',
  'lint-staged.config.js',
  'lint-staged.config.mjs',
  'stylelint.config.cjs',
  'stylelint.config.js',
  'stylelint.config.mjs',
  'tsconfig.base.json',
  'tsconfig.json',
  'turbo.json',
  'vitest.config.ts',
  'vitest.workspace.ts',
])

/** Organization packages manage engineering files, never business code or dependency manifests. */
export function presetAssetTarget(value: string) {
  const target = presetRelativePath(value)
  if (rootAssets.has(target)
    || /^\.github\/(?:workflows\/[^/]+\.ya?ml|ISSUE_TEMPLATE\/[^/]+\.(?:ya?ml|md)|PULL_REQUEST_TEMPLATE\.md)$/u.test(target)
    || /^\.vscode\/(?:settings|extensions|tasks)\.json$/u.test(target)
    || (/^scripts\/.+\.(?:[cm]?js|ts|sh)$/u.test(target) && !target.split('/').some(part => part === 'node_modules' || part === '.git'))) {
    return target
  }
  throw new Error('Preset assets must target supported root tooling files, GitHub/VS Code configuration, or engineering scripts.')
}
