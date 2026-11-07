import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { runStylelintSync as runBuiltStylelintSync } from 'eslint-plugin-better-stylelint'
import { __clearStylelintResultCache, __resetStylelintWorker, runStylelintSync } from '@/core'
import { lintRule } from '@/index'

describe('stylelint worker integration', () => {
  let tempDir = ''

  async function writeConfig(filename: string, contents: string) {
    await fs.writeFile(path.join(tempDir, filename), contents, 'utf8')
  }

  beforeEach(async () => {
    __clearStylelintResultCache()
    __resetStylelintWorker()
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'better-stylelint-worker-'))
    await writeConfig(
      'stylelint.config.cjs',
      [
        'module.exports = {',
        '  rules: {',
        '    "color-no-invalid-hex": true,',
        '  },',
        '}',
      ].join('\n'),
    )
  })

  afterEach(async () => {
    __clearStylelintResultCache()
    __resetStylelintWorker()

    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('returns real stylelint diagnostics for css files', () => {
    const filename = path.join(tempDir, 'sample.css')
    const diagnostics = runStylelintSync(
      '.demo { color: #ggg; }\n',
      filename,
      tempDir,
    )

    expect(diagnostics).toEqual([
      expect.objectContaining({
        ruleId: 'color-no-invalid-hex',
        line: 1,
        severity: 2,
      }),
    ])
  })

  it('runs the standalone worker through the public built entry', () => {
    const filename = path.join(tempDir, 'sample.css')

    expect(runBuiltStylelintSync('.demo { color: #ggg; }\n', filename, tempDir)).toEqual([
      expect.objectContaining({
        ruleId: 'color-no-invalid-hex',
        line: 1,
        severity: 2,
      }),
    ])
    expect(runBuiltStylelintSync('.demo { color: #fff; }\n', filename, tempDir)).toEqual([])
  })

  it('auto-discovers stylelint.config.ts', async () => {
    await fs.rm(path.join(tempDir, 'stylelint.config.cjs'), { force: true })
    await writeConfig(
      'stylelint.config.ts',
      [
        'export default {',
        '  rules: {',
        '    "color-no-invalid-hex": true,',
        '  },',
        '}',
      ].join('\n'),
    )

    const diagnostics = runStylelintSync(
      '.demo { color: #ggg; }\n',
      path.join(tempDir, 'sample.css'),
      tempDir,
    )

    expect(diagnostics).toEqual([
      expect.objectContaining({
        ruleId: 'color-no-invalid-hex',
        line: 1,
        severity: 2,
      }),
    ])
  })

  it('resolves extends from the project config', async () => {
    await writeConfig(
      'base-stylelint.cjs',
      [
        'module.exports = {',
        '  rules: {',
        '    "color-no-invalid-hex": true,',
        '  },',
        '}',
      ].join('\n'),
    )
    await writeConfig(
      'stylelint.config.cjs',
      [
        'module.exports = {',
        '  extends: ["./base-stylelint.cjs"],',
        '}',
      ].join('\n'),
    )

    const diagnostics = runStylelintSync(
      '.demo { color: #ggg; }\n',
      path.join(tempDir, 'sample.css'),
      tempDir,
    )

    expect(diagnostics).toEqual([
      expect.objectContaining({
        ruleId: 'color-no-invalid-hex',
      }),
    ])
  })

  it('supports plugins declared in the project stylelint config', async () => {
    const require = createRequire(import.meta.url)
    const stylelintDirectory = await fs.realpath(path.dirname(require.resolve('stylelint/package.json')))
    const nodeModulesDirectory = path.join(tempDir, 'node_modules')
    await fs.mkdir(nodeModulesDirectory, { recursive: true })
    await fs.symlink(
      stylelintDirectory,
      path.join(nodeModulesDirectory, 'stylelint'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    await fs.rm(path.join(tempDir, 'stylelint.config.cjs'))
    await writeConfig(
      'stylelint.config.ts',
      [
        'import stylelint from "stylelint"',
        '',
        'const ruleName = "demo/no-red"',
        'const plugin = stylelint.createPlugin(ruleName, () => {',
        '  return (root, result) => {',
        '    root.walkDecls("color", (decl) => {',
        '      if (decl.value !== "red") return',
        '      stylelint.utils.report({',
        '        message: "Unexpected red color",',
        '        node: decl,',
        '        result,',
        '        ruleName,',
        '      })',
        '    })',
        '  }',
        '})',
        '',
        'export default {',
        '  plugins: [plugin],',
        '  rules: {',
        '    [ruleName]: true,',
        '  },',
        '}',
      ].join('\n'),
    )

    const diagnostics = runStylelintSync(
      '.demo { color: red; }\n',
      path.join(tempDir, 'sample.css'),
      tempDir,
    )

    expect(diagnostics).toEqual([
      expect.objectContaining({
        ruleId: 'demo/no-red',
        message: 'Unexpected red color (demo/no-red)',
      }),
    ])
  })

  it('honors customSyntax from the discovered config', async () => {
    await writeConfig(
      'stylelint.config.cjs',
      [
        'module.exports = {',
        '  customSyntax: "postcss-scss",',
        '  rules: {',
        '    "block-no-empty": true,',
        '  },',
        '}',
      ].join('\n'),
    )

    const diagnostics = runStylelintSync(
      '$brand: red;\n.demo { color: $brand; }\n',
      path.join(tempDir, 'sample.scss'),
      tempDir,
    )

    expect(diagnostics).toEqual([])
  })

  it('reports vue style block diagnostics through the eslint rule', () => {
    const filename = path.join(tempDir, 'sample.vue')
    const report = vi.fn()
    const listeners = lintRule.create({
      filename,
      options: [{ cwd: tempDir }],
      report,
      sourceCode: {
        text: [
          '<template><div /></template>',
          '<style>',
          '.demo { color: #ggg; }',
          '</style>',
        ].join('\n'),
      },
    })

    listeners.Program()

    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith(expect.objectContaining({
      loc: {
        start: {
          line: 3,
          column: 15,
        },
        end: {
          line: 3,
          column: 19,
        },
      },
      message: 'Invalid hex color "#ggg" (color-no-invalid-hex)',
    }))
  })

  it('includes scoped/module/lang block context for multiple vue style blocks', () => {
    const filename = path.join(tempDir, 'sample.vue')
    const report = vi.fn()
    const listeners = lintRule.create({
      filename,
      options: [{ cwd: tempDir }],
      report,
      sourceCode: {
        text: [
          '<template><div /></template>',
          '<style scoped>',
          '.plain { color: #ggg; }',
          '</style>',
          '<style module="$style" lang="scss">',
          '.module { color: #ggg; }',
          '</style>',
        ].join('\n'),
      },
    })

    listeners.Program()

    expect(report).toHaveBeenCalledTimes(2)
    expect(report).toHaveBeenNthCalledWith(1, expect.objectContaining({
      loc: {
        start: {
          line: 3,
          column: 16,
        },
        end: {
          line: 3,
          column: 20,
        },
      },
      message: '[style#1 scoped] Invalid hex color "#ggg" (color-no-invalid-hex)',
    }))
    expect(report).toHaveBeenNthCalledWith(2, expect.objectContaining({
      loc: {
        start: {
          line: 6,
          column: 17,
        },
        end: {
          line: 6,
          column: 21,
        },
      },
      message: '[style#2 module=$style lang=scss] Invalid hex color "#ggg" (color-no-invalid-hex)',
    }))
  })
})
