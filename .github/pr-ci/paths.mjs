// Keep source-repository path filters here; consumer templates keep their own workflows.
export const ciIgnoredPaths = ['**/*.md', 'docs/**', '.changeset/**', 'LICENSE*']

export const devcontainerPaths = [
  '.github/workflows/devcontainer.yml',
  'scripts/devcontainer/**',
  'scripts/nimbus/**',
  'scripts/packaged-template/**',
  'packages/monorepo/src/commands/init/devcontainer/**',
  'packages/monorepo/src/cli/commands/tooling/**',
  'packages/monorepo/resources/devcontainer/**',
  'packages/monorepo/src/core/file-transaction/**',
  'packages/monorepo/src/core/operation-lock/**',
  'packages/monorepo/src/types/devcontainer.ts',
  'packages/monorepo/src/cli/commands/tooling.ts',
  'packages/monorepo/src/commands/index.ts',
  'templates/react-vite/**',
  'templates/tsdown/**',
  'templates/nimbus/**',
  'package.json',
  'pnpm-workspace.yaml',
  'packages/monorepo-templates/**',
  'pnpm-lock.yaml',
]

function matches(filename, pattern) {
  if (pattern === '**/*.md') {
    return filename.endsWith('.md')
  }
  if (pattern.endsWith('/**')) {
    return filename.startsWith(pattern.slice(0, -2))
  }
  if (pattern === 'LICENSE*') {
    return !filename.includes('/') && filename.startsWith('LICENSE')
  }
  return filename === pattern
}

export function validationPaths(files, changedFiles = files.length) {
  // Incomplete GitHub file lists must not skip tests.
  if (changedFiles > files.length) {
    return { run_ci: true, run_devcontainer: true }
  }
  const filenames = files.flatMap(file => typeof file === 'string' ? [file] : [file.filename, file.previous_filename].filter(Boolean))
  return {
    run_ci: filenames.some(filename => !ciIgnoredPaths.some(pattern => matches(filename, pattern))),
    run_devcontainer: filenames.some(filename => devcontainerPaths.some(pattern => matches(filename, pattern))),
  }
}
