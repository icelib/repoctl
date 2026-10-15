const configExtensions = ['js', 'cjs', 'mjs', 'ts', 'cts', 'mts']

export const legacyStagedConfigNames = [
  '.lintstagedrc',
  '.lintstagedrc.json',
  '.lintstagedrc.yml',
  '.lintstagedrc.yaml',
  ...configExtensions.flatMap(extension => [`lint-staged.config.${extension}`, `.lintstagedrc.${extension}`]),
]
