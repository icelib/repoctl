import type { Linter } from 'eslint'
import fs from 'node:fs/promises'
import path from 'node:path'
import { ESLint } from 'eslint'
import { icebreaker } from '@/index'

const ROOT_DIR = path.resolve(__dirname, '..')
let tempDir = ''

type EslintOverrideConfig = NonNullable<ConstructorParameters<typeof ESLint>[0]>['overrideConfig']

function asOverrideConfig(configs: unknown): EslintOverrideConfig {
  return configs as EslintOverrideConfig
}

function stripUnsupportedRules(configs: unknown[]): Linter.Config[] {
  return (configs as Linter.Config[]).map((config) => {
    if (!config.rules) {
      return config
    }
    if (!Object.hasOwn(config.rules, 'ts/ban-types')) {
      return config
    }
    const { 'ts/ban-types': _banTypes, ...rest } = config.rules
    return {
      ...config,
      ...(Object.keys(rest).length > 0 ? { rules: rest } : {}),
    }
  })
}

describe('eslint branch config behavior', () => {
  let eslint: ESLint

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(ROOT_DIR, '.tmp-eslint-branches-'))
    await fs.writeFile(
      path.join(tempDir, 'sample.vue'),
      '<template><text>Hello</text></template>\n',
      'utf8',
    )
    await fs.writeFile(
      path.join(tempDir, 'sample.ts'),
      'export class Sample {}\n',
      'utf8',
    )
    await fs.writeFile(
      path.join(tempDir, 'sample.js'),
      'wx.showToast({ title: String(getCurrentPages().length) })\n',
      'utf8',
    )
    await fs.writeFile(
      path.join(tempDir, 'sample.css'),
      '.demo {}\n',
      'utf8',
    )
    await fs.writeFile(
      path.join(tempDir, 'sample.json'),
      '{}\n',
      'utf8',
    )
    await fs.writeFile(
      path.join(tempDir, 'unsupported.ts'),
      'import { createSSRApp } from \'vue\'\ncreateSSRApp({})\n',
      'utf8',
    )
    await fs.writeFile(
      path.join(tempDir, 'risky.ts'),
      'import { useRouter } from \'vue-router\'\nuseRouter()\n',
      'utf8',
    )
    await fs.writeFile(
      path.join(tempDir, 'router-link.vue'),
      [
        '<script setup lang="ts">',
        'import { RouterLink } from \'vue-router\'',
        '</script>',
        '<template>',
        '  <RouterLink to="/demo">Demo</RouterLink>',
        '</template>',
        '',
      ].join('\n'),
      'utf8',
    )

    const configs = await icebreaker({
      vue: true,
      typescript: true,
      miniProgram: true,
      ionic: true,
      nestjs: true,
    }).toConfigs()

    eslint = new ESLint({
      cwd: tempDir,
      overrideConfig: asOverrideConfig(stripUnsupportedRules(configs)),
      overrideConfigFile: true,
    })
  })

  afterAll(async () => {
    if (!tempDir) {
      return
    }
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('disables singleline content newline checks for mini program templates', async () => {
    const config = await eslint.calculateConfigForFile(
      path.join(tempDir, 'sample.vue'),
    )
    const rule = config.rules?.['vue/singleline-html-element-content-newline']

    const ruleDisabled = rule === 'off'
      || (Array.isArray(rule) && rule[0] === 0)
    expect(ruleDisabled).toBe(true)
  })

  it('disables deprecated slot attribute rule for mini program', async () => {
    const configs = await icebreaker({
      vue: true,
      miniProgram: true,
    }).toConfigs()
    const miniProgramEslint = new ESLint({
      cwd: tempDir,
      overrideConfig: asOverrideConfig(stripUnsupportedRules(configs)),
      overrideConfigFile: true,
    })
    const config = await miniProgramEslint.calculateConfigForFile(
      path.join(tempDir, 'sample.vue'),
    )

    const slotRule = config.rules?.['vue/no-deprecated-slot-attribute']
    const slotRuleDisabled = slotRule === 'off'
      || (Array.isArray(slotRule) && slotRule[0] === 0)
    expect(slotRuleDisabled).toBe(true)
  })

  it('applies nestjs overrides for no-empty-function', async () => {
    const config = await eslint.calculateConfigForFile(
      path.join(tempDir, 'sample.ts'),
    )
    const rule = config.rules?.['ts/no-empty-function'] as
      | [string, { allow?: string[] }]
      | undefined

    expect([2, 'error']).toContain(rule?.[0])
    expect(rule?.[1]?.allow).toEqual(
      expect.arrayContaining(['decoratedFunctions']),
    )
  })

  it('disables style/eol-last only for style and json files', async () => {
    const cssConfig = await eslint.calculateConfigForFile(
      path.join(tempDir, 'sample.css'),
    )
    const jsonConfig = await eslint.calculateConfigForFile(
      path.join(tempDir, 'sample.json'),
    )
    const tsConfig = await eslint.calculateConfigForFile(
      path.join(tempDir, 'sample.ts'),
    )

    const cssRule = cssConfig.rules?.['style/eol-last']
    const jsonRule = jsonConfig.rules?.['style/eol-last']
    const jsonUnicornRule = jsonConfig.rules?.['unicorn/prefer-number-properties']
    const tsRule = tsConfig.rules?.['style/eol-last']

    const cssRuleDisabled = cssRule === 'off'
      || (Array.isArray(cssRule) && cssRule[0] === 0)
    const jsonRuleDisabled = jsonRule === 'off'
      || (Array.isArray(jsonRule) && jsonRule[0] === 0)
    const tsRuleEnabled = tsRule === 'error'
      || tsRule === 'warn'
      || (Array.isArray(tsRule) && [1, 2, 'warn', 'error'].includes(tsRule[0] as never))

    expect(cssRuleDisabled).toBe(true)
    expect(jsonRuleDisabled).toBe(true)
    expect(jsonUnicornRule === 'off' || (Array.isArray(jsonUnicornRule) && jsonUnicornRule[0] === 0)).toBe(true)
    expect(tsRuleEnabled).toBe(true)
  })

  it('wires stylelint bridge processors and vue rule when enabled', async () => {
    const configs = await icebreaker({
      vue: true,
      stylelint: true,
    }).toConfigs()

    const bridgeConfigs = stripUnsupportedRules(configs)
    const cssBridgeConfig = bridgeConfigs.find(config =>
      Array.isArray(config.files)
      && config.files.includes('**/*.{css,pcss,postcss}'),
    )
    const vueBridgeConfig = bridgeConfigs.find(config =>
      Array.isArray(config.files)
      && config.files.includes('**/*.vue')
      && config.rules?.['stylelint/stylelint'],
    )

    expect(typeof cssBridgeConfig?.processor).toBe('object')
    expect(vueBridgeConfig?.rules?.['stylelint/stylelint']).toEqual([
      'error',
      expect.objectContaining({
        configLoader: expect.stringMatching(/stylelint\.(ts|js)$/u),
        configOptions: expect.any(Object),
      }),
    ])
  })

  it('injects mini program globals into javascript files', async () => {
    const results = await eslint.lintFiles([
      path.join(tempDir, 'sample.js'),
    ])

    expect(results[0]?.messages).toEqual([])
  })

  it('reports unsupported and risky upstream APIs for mini program projects', async () => {
    const [unsupportedResult, riskyResult] = await eslint.lintFiles([
      path.join(tempDir, 'unsupported.ts'),
      path.join(tempDir, 'risky.ts'),
    ])

    expect(unsupportedResult?.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'wevu/no-unsupported-api',
        severity: 2,
      }),
    ]))
    expect(riskyResult?.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'wevu/no-risky-api',
        severity: 1,
      }),
    ]))
  })

  it('reports unsupported RouterLink template usage', async () => {
    const [result] = await eslint.lintFiles([
      path.join(tempDir, 'router-link.vue'),
    ])

    expect(result?.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'wevu/no-unsupported-template-feature',
        severity: 2,
      }),
    ]))
  })

  it('keeps compatibility rules disabled without mini program support', async () => {
    const configs = await icebreaker({
      vue: true,
      miniProgram: false,
    }).toConfigs()
    const regularEslint = new ESLint({
      cwd: tempDir,
      overrideConfig: asOverrideConfig(stripUnsupportedRules(configs)),
      overrideConfigFile: true,
    })
    const [result] = await regularEslint.lintFiles([
      path.join(tempDir, 'unsupported.ts'),
    ])

    expect(result?.messages.some(message => message.ruleId?.startsWith('wevu/'))).toBe(false)
  })

  it('allows user configs to override compatibility rule severity', async () => {
    const configs = await icebreaker(
      {
        vue: true,
        miniProgram: true,
      },
      {
        rules: {
          'wevu/no-unsupported-api': 'off',
        },
      },
    ).toConfigs()
    const overriddenEslint = new ESLint({
      cwd: tempDir,
      overrideConfig: asOverrideConfig(stripUnsupportedRules(configs)),
      overrideConfigFile: true,
    })
    const [result] = await overriddenEslint.lintFiles([
      path.join(tempDir, 'unsupported.ts'),
    ])

    expect(result?.messages.some(message => message.ruleId === 'wevu/no-unsupported-api')).toBe(false)
  })

  it('ignores common mini program output paths', async () => {
    expect(await eslint.isPathIgnored(path.join(tempDir, 'dist', 'output.js'))).toBe(true)
    expect(await eslint.isPathIgnored(path.join(tempDir, '.weapp-vite', 'cache.js'))).toBe(true)
    expect(await eslint.isPathIgnored(path.join(tempDir, 'miniprogram_npm', 'vendor.js'))).toBe(true)
    expect(await eslint.isPathIgnored(path.join(tempDir, 'project.config.json'))).toBe(true)
    expect(await eslint.isPathIgnored(path.join(tempDir, 'project.private.config.json'))).toBe(true)
  })
})
