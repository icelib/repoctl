import type { MonorepoConfig } from 'repoctl'

function createLintStagedConfig(monorepoCommand: string) {
  return {
    '*.{js,jsx,mjs,ts,tsx,mts,cts}': [
      'eslint --fix',
    ],
    '*.vue': [
      'eslint --fix',
      'stylelint --fix --allow-empty-input',
    ],
    '*.{ts,tsx,mts,cts,vue}': (files: string[]) => {
      const uniqueFiles = [...new Set(files)]
      if (uniqueFiles.length === 0) {
        return []
      }
      return `${monorepoCommand} verify staged-typecheck ${uniqueFiles.map(file => `'${file.replaceAll('\'', '\'\\\'\'')}'`).join(' ')}`
    },
    '*.{json,md,mdx,html,yml,yaml}': [
      'eslint --fix',
    ],
    '*.{css,scss,sass,less}': [
      'stylelint --fix --allow-empty-input',
    ],
  }
}

export default {
  commands: {
    create: {
      defaultTemplate: 'tsdown',
      renameJson: false,
    },
    clean: {
      autoConfirm: false,
      ignorePackages: ['@icebreakers/website'],
    },
    upgrade: {
      skipOverwrite: false,
      mergeTargets: true,
    },
  },
  tooling: {
    commitlint: {
      extends: ['@commitlint/config-conventional'],
    },
    eslint: {
      ignores: ['**/fixtures/**'],
    },
    stylelint: {
      rules: {},
    },
    lintStaged: {
      config: createLintStagedConfig('pnpm exec repoctl'),
    },
    tsconfig: {
      compilerOptions: {},
    },
    vitest: {
      includeWorkspaceRootConfig: false,
      coverageSkipFull: true,
    },
    vitestProject: {
      globals: true,
      testTimeout: 60_000,
    },
  },
} satisfies MonorepoConfig
