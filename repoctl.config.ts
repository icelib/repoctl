import type { MonorepoConfig } from 'repoctl'

export default {
  commands: {
    release: {
      // repoctl-source-only:start
      nightly: { provider: 'npm', schedule: '17 19 * * *' },
      qualityScripts: ['build', 'lint', 'typecheck', 'tsd', 'test'],
      // repoctl-source-only:end
      hooks: {
        // repoctl-source-only:start
        verify: ['check:workflows'],
        // repoctl-source-only:end
        afterPublish: [{ script: 'release:sync-npmmirror', continueOnError: true, idempotent: true }],
      },
    },
    create: {
      defaultTemplate: 'tsdown',
      renameJson: false,
    },
    clean: {
      autoConfirm: false,
      includePrivate: true,
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
      astro: true,
      ignores: ['**/fixtures/**'],
      svelte: true,
      vue: true,
    },
    stylelint: {
      rules: {
        'media-feature-range-notation': 'prefix',
      },
    },
    vitest: {
      includeWorkspaceRootConfig: false,
      coverageExclude: ['**/dist/**'],
      coverageSkipFull: true,
    },
    vitestProject: {
      globals: true,
      testTimeout: 60_000,
    },
  },
} satisfies MonorepoConfig
