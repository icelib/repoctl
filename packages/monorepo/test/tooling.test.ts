import { describe, expect, it } from 'vitest'
import {
  createMonorepoCommitlintConfig,
  createMonorepoEslintConfig,
  createMonorepoLintStagedConfig,
  createMonorepoStylelintConfig,
  createMonorepoTsconfig,
  createMonorepoVitestConfig,
  createMonorepoVitestProjectConfig,
  defineCommitlintConfig,
  defineEslintConfig,
  defineLintStagedConfig,
  defineStylelintConfig,
  defineTsconfigConfig,
  defineVitestConfig,
  defineVitestProjectConfig,
  loadMonorepoToolingConfig,
} from '@/index'

describe('tooling factories', () => {
  it('creates shared config wrappers', () => {
    expect(createMonorepoCommitlintConfig()).toBeTruthy()
    expect(createMonorepoEslintConfig()).toBeTruthy()
    expect(createMonorepoStylelintConfig()).toBeTruthy()
    expect(createMonorepoTsconfig()).toBeTruthy()
  })

  it('creates lint-staged config with overridable repo command', () => {
    const config = createMonorepoLintStagedConfig({
      repoCommand: 'pnpm exec repo',
    })
    const command = config['*.{ts,tsx,mts,cts,vue,astro,mdx,json}']

    expect(typeof command).toBe('function')
    if (typeof command !== 'function') {
      throw new TypeError('expected lint-staged rule to be callable')
    }
    expect(command(['src/index.ts'])).toContain('pnpm exec repo verify staged-typecheck')
    expect(command(['templates/client/package.json'])).toContain('pnpm exec repo verify staged-typecheck')
  })

  it('passes through complete lint-staged config when provided', () => {
    const config = createMonorepoLintStagedConfig({
      config: {
        '*.md': ['prettier --write'],
      },
    })

    expect(config).toEqual({
      '*.md': ['prettier --write'],
    })
  })

  it('creates vitest config from explicit project roots', () => {
    const config = createMonorepoVitestConfig({
      rootDir: process.cwd(),
      projectRoots: ['packages'],
    })

    expect(config.test.coverage?.enabled).toBe(true)
    expect(Array.isArray(config.test.projects)).toBe(true)
  })

  it('defines vitest config with inline overrides', async () => {
    const config = await defineVitestConfig({
      options: {
        includeWorkspaceRootConfig: false,
      },
      overrides: {
        test: {
          coverage: {
            exclude: ['**/dist/**'],
            skipFull: false,
          },
        },
      },
    })

    expect(config.test.coverage?.exclude).toEqual(['**/dist/**'])
    expect(config.test.coverage?.skipFull).toBe(false)
  })

  it('merges complete vitest overrides into final config', async () => {
    const config = await defineVitestConfig({
      options: {
        includeWorkspaceRootConfig: false,
      },
      overrides: {
        resolve: {
          alias: {
            '@': '/tmp/src',
          },
        },
      },
    })

    expect(config.resolve?.alias).toMatchObject({
      '@': '/tmp/src',
    })
  })

  it('defines wrapper configs with inline overrides', async () => {
    const extraEslintConfig = {
      rules: {
        'no-alert': 'off' as const,
      },
    }
    const commitlint = await defineCommitlintConfig({
      options: {
        extends: ['@custom/commitlint-config'],
      },
    })
    const eslint = await defineEslintConfig({
      options: {
        ignores: ['custom-ignore/**'],
      },
      configs: [
        {
          rules: {
            'no-console': 'off',
          },
        },
      ],
    })
    const eslintDirect = await defineEslintConfig(
      {
        ignores: ['direct-ignore/**'],
      },
      extraEslintConfig,
    )
    const eslintCreated = await createMonorepoEslintConfig(
      {
        ignores: ['created-ignore/**'],
        configs: [
          {
            rules: {
              'no-debugger': 'off',
            },
          },
        ],
      },
      extraEslintConfig,
    )
    const eslintOptionsConfigs = await defineEslintConfig({
      options: {
        configs: [
          {
            rules: {
              'no-restricted-syntax': 'off',
            },
          },
        ],
      },
    })
    const stylelint = await defineStylelintConfig({
      options: {
        rules: {
          'selector-class-pattern': null,
        },
      },
    })
    const lintStaged = await defineLintStagedConfig({
      options: {
        repoCommand: 'repo',
      },
    })
    const eslintIgnores = eslint
      .flatMap((config) => {
        const ignores = (config as { ignores?: string[] }).ignores
        return Array.isArray(ignores) ? ignores : []
      })

    expect(commitlint['extends']).toEqual(['@custom/commitlint-config'])
    expect(eslintIgnores).toContain('custom-ignore/**')
    expect(eslint.some(config => config.rules?.['no-console'] === 'off')).toBe(true)
    expect(eslintDirect.some(config => config.rules?.['no-alert'] === 'off')).toBe(true)
    expect(eslintCreated.some(config => config.rules?.['no-alert'] === 'off')).toBe(true)
    expect(eslintCreated.some(config => config.rules?.['no-debugger'] === 'off')).toBe(true)
    expect(eslintOptionsConfigs.some(config => config.rules?.['no-restricted-syntax'] === 'off')).toBe(true)
    expect(stylelint['rules']).toMatchObject({
      'selector-class-pattern': null,
    })

    const command = lintStaged['*.{ts,tsx,mts,cts,vue,astro,mdx,json}']
    expect(typeof command).toBe('function')
    if (typeof command !== 'function') {
      throw new TypeError('expected lint-staged rule to be callable')
    }
    expect(command(['src/index.ts'])).toContain('repo verify staged-typecheck')
    expect(command(['templates/client/package.json'])).toContain('repo verify staged-typecheck')
  })

  it('reads define wrapper cwd from object input', async () => {
    expect(await defineCommitlintConfig({ cwd: process.cwd() })).toBeTruthy()
    expect(await defineEslintConfig({ cwd: process.cwd() })).toBeTruthy()
    expect(await defineStylelintConfig({ cwd: process.cwd() })).toBeTruthy()
    expect(await defineLintStagedConfig({ cwd: process.cwd() })).toBeTruthy()
    expect(await defineTsconfigConfig({ cwd: process.cwd() })).toBeTruthy()
    expect(await defineVitestProjectConfig({ cwd: process.cwd() })).toBeTruthy()
  })

  it('creates project-level vitest config with shared defaults', () => {
    const config = createMonorepoVitestProjectConfig({
      environment: 'node',
      alias: [{ find: '@', replacement: '/tmp/src' }],
    })

    expect(config.test.globals).toBe(true)
    expect(config.test.testTimeout).toBe(60_000)
    expect(config.test.environment).toBe('node')
    expect(config.test.alias).toEqual([{ find: '@', replacement: '/tmp/src' }])
  })

  it('defines project-level vitest config with inline overrides', async () => {
    const config = await defineVitestProjectConfig({
      options: {
        environment: 'jsdom',
        alias: [{ find: '@', replacement: '/tmp/project-src' }],
      },
    })

    expect(config.test.globals).toBe(true)
    expect(config.test.testTimeout).toBe(60_000)
    expect(config.test.environment).toBe('jsdom')
    expect(config.test.alias).toEqual([{ find: '@', replacement: '/tmp/project-src' }])
  })

  it('loads tooling config from repoctl config', async () => {
    const config = await loadMonorepoToolingConfig(process.cwd())
    expect(config).toBeTruthy()
  })

  it('creates tsconfig with merged compilerOptions', async () => {
    const config = await defineTsconfigConfig({
      options: {
        compilerOptions: {
          baseUrl: '.',
        },
        include: ['src'],
      },
    })

    expect(config.compilerOptions?.['target']).toBe('ESNext')
    expect(config.compilerOptions?.['baseUrl']).toBe('.')
    expect(config.include).toEqual(['src'])
  })

  it('defines wrapper configs internally from repoctl config', async () => {
    expect(await defineCommitlintConfig()).toBeTruthy()
    expect(await defineEslintConfig()).toBeTruthy()
    expect(await defineStylelintConfig()).toBeTruthy()
    expect(await defineLintStagedConfig()).toBeTruthy()
    expect(await defineTsconfigConfig()).toBeTruthy()
    expect(await defineVitestConfig()).toBeTruthy()
    expect(await defineVitestProjectConfig()).toBeTruthy()
  })
})
