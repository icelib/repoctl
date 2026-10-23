import type { MonorepoConfig } from 'repoctl'

// repoctl-source-only:start
const documentationPackages = {
  'repoctl': 'packages/repoctl',
  'create-repoctl': 'packages/create-repoctl',
  'create-icebreaker': 'packages/create-icebreaker',
  '@icebreakers/monorepo': 'packages/monorepo',
  '@icebreakers/monorepo-templates': 'packages/monorepo-templates',
  '@icebreakers/commitlint-config': 'packages/commitlint',
  '@icebreakers/eslint-config': 'packages/eslint',
  '@icebreakers/stylelint-config': 'packages/stylelint',
  '@icebreakers/changelog-github': 'packages/changelog-github',
  'eslint-plugin-better-stylelint': 'packages/eslint-plugin-better-stylelint',
  'stylelint-plugin-tailwindcss': 'packages/stylelint-plugin-tailwindcss',
  'postcss-tailwindcss': 'packages/postcss-tailwindcss',
  'lightningcss-tailwindcss': 'packages/lightningcss-tailwindcss',
}
const documentationReleaseInputs = Object.fromEntries(Object.entries(documentationPackages).map(([name, directory]) => [name, [
  `${directory}/**`,
  'tsconfig.json',
  'packages/monorepo/tsconfig.base.json',
  '!**/README*',
  '!**/CHANGELOG*',
  '!**/docs/**',
  '!**/test/**',
  '!**/tests/**',
  '!**/__tests__/**',
  '!**/test-d/**',
  '!**/fixtures/**',
  '!**/*.test.*',
  '!**/*.spec.*',
  ...(name === '@icebreakers/eslint-config' ? ['packages/stylelint/src/**', 'packages/eslint-plugin-better-stylelint/src/**'] : []),
  // These are published template assets, including their documentation and tests.
  ...(name === '@icebreakers/monorepo-templates'
    ? [
        'templates/**',
        'packages/monorepo/assets/**',
        'packages/monorepo/resources/skills/**',
        'package.json',
        'pnpm-workspace.yaml',
        'repoctl.config.ts',
        '.github/**',
        // GitHub preparation publishes source metadata and Release; other workflows come from package assets.
        '!.github/pr-ci',
        '!.github/pr-ci/**',
        '!.github/nightly',
        '!.github/nightly/**',
        '!.github/workflows/**',
        '.github/workflows/release.yml',
        '.vscode/**',
        '.agents/**',
        '.editorconfig',
        '.gitattributes',
        '.gitignore',
        '.npmrc',
        'commitlint.config.ts',
        'eslint.config.js',
        'stylelint.config.js',
        'lefthook.yml',
        'turbo.json',
        'vitest.config.ts',
        'Dockerfile',
        '.dockerignore',
        'renovate.json',
        'LICENSE',
        'SECURITY.md',
        'CODE_OF_CONDUCT.md',
        'CONTRIBUTING.md',
      ]
    : []),
]]))
// repoctl-source-only:end

export default {
  commands: {
    // repoctl-source-only:start
    docs: {
      sites: {
        website: {
          packages: Object.keys(documentationPackages),
          releaseInputs: documentationReleaseInputs,
          buildScript: 'docs:build',
          preview: {
            provider: 'cloudflare-workers',
            config: 'templates/vitepress/wrangler.jsonc',
            accountId: '2db8e8dc78d5ffdd9fe579a7188b7826',
            workerName: 'repoctl-docs-next',
            environment: 'next',
            url: 'https://next.repo.icebreaker.top',
          },
          stable: {
            provider: 'cloudflare-workers',
            config: 'templates/vitepress/wrangler.jsonc',
            accountId: '2db8e8dc78d5ffdd9fe579a7188b7826',
            workerName: 'repoctl-docs',
            url: 'https://repo.icebreaker.top',
          },
          patchPaths: ['templates/vitepress/**/*.md', 'templates/vitepress/public/**/*.{png,jpg,jpeg,webp,svg}'],
        },
      },
    },
    // repoctl-source-only:end
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
