import type { Command } from '@icebreakers/monorepo-templates'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(async () => {
  delete process.env['REPOCTL_LANG']
  await vi.resetModules()
})

describe('program help surface', () => {
  it('uses Simplified Chinese help when REPOCTL_LANG is set', async () => {
    process.env['REPOCTL_LANG'] = 'zh-CN'
    const { default: program } = await import('@/cli/program')

    let rootHelp = ''
    program.configureOutput({
      writeOut: (value) => {
        rootHelp += value
      },
    })
    program.outputHelp()
    expect(rootHelp).toContain('用法： repo')
    expect(rootHelp).toContain('选项：')
    expect(rootHelp).toContain('命令：')
    expect(rootHelp).toContain('显示命令帮助')
    expect(rootHelp).toContain('面向 pnpm 与 Turborepo 工作区')
    expect(rootHelp).toContain('输出语言：en 或 zh-CN')
    expect(rootHelp).toContain('快速开始：')
    expect(program.commands.find((command: Command) => command.name() === 'doctor')?.description()).toContain('诊断当前仓库')
  })

  it('uses repoctl in help when invoked through the repoctl bin', async () => {
    const entry = process.argv[1]
    process.argv[1] = '/workspace/bin/repoctl.js'
    try {
      await vi.resetModules()
      const { default: program } = await import('@/cli/program')
      let renderedHelp = ''
      program.configureOutput({
        writeOut: (value) => {
          renderedHelp += value
        },
      })
      program.outputHelp()
      expect(program.name()).toBe('repoctl')
      expect(renderedHelp).toContain('Usage: repoctl')
      expect(renderedHelp).toContain('$ repoctl doctor')
    }
    finally {
      if (entry === undefined) {
        process.argv.splice(1, 1)
      }
      else {
        process.argv[1] = entry
      }
    }
  })

  it('localizes Commander errors in Simplified Chinese', async () => {
    process.env['REPOCTL_LANG'] = 'zh-CN'
    const { default: program } = await import('@/cli/program')
    let errorOutput = ''
    program.exitOverride()
    program.configureOutput({
      writeErr: (value) => {
        errorOutput += value
      },
    })

    await expect(program.parseAsync(['node', 'repo', 'missing-command'])).rejects.toThrow()
    expect(errorOutput).toContain('错误： 未知命令 \'missing-command\'')
  })

  it('exposes grouped commands and short aliases in help output', async () => {
    const { default: program } = await import('@/cli/program')

    let renderedHelp = ''
    program.configureOutput({
      writeOut: (str) => {
        renderedHelp += str
      },
      writeErr: () => {},
    })
    program.outputHelp()

    const rootHelp = renderedHelp
    expect(rootHelp).toContain('workspace')
    expect(rootHelp).toContain('tooling')
    expect(rootHelp).toContain('package')
    expect(rootHelp).toContain('verify')
    expect(rootHelp).toContain('skills')
    expect(rootHelp).toContain('env')
    expect(rootHelp).toContain('config')
    expect(rootHelp).toContain('ai')
    expect(rootHelp).toContain('\n  init [options]')
    expect(rootHelp).toContain('\n  new [options] [name]')
    expect(rootHelp).toContain('\n  recover|recover-create [options] <target>')
    expect(rootHelp).toContain('\n  templates|tpl [options] [key]')
    expect(rootHelp).toContain('\n  check [options]')
    expect(rootHelp).toContain('\n  doctor [options]')
    expect(rootHelp).toContain('\n  upgrade [options]')
    expect(rootHelp).toContain('Existing repo:')
    expect(rootHelp).toContain('$ repo init')
    expect(rootHelp).toContain('$ repo doctor')
    expect(rootHelp).toContain('$ repo templates')
    expect(rootHelp).toContain('$ repo new my-package')
    expect(rootHelp).toContain('Faster in generated repos:')
    expect(rootHelp).toContain('$ pnpm run repo:init')
    expect(rootHelp).toContain('$ pnpm run repo:doctor')

    const workspace = program.commands.find((command: Command) => command.name() === 'workspace')
    const tooling = program.commands.find((command: Command) => command.name() === 'tooling')
    const packageCommand = program.commands.find((command: Command) => command.name() === 'package')
    const env = program.commands.find((command: Command) => command.name() === 'env')
    const config = program.commands.find((command: Command) => command.name() === 'config')
    const verify = program.commands.find((command: Command) => command.name() === 'verify')
    const skills = program.commands.find((command: Command) => command.name() === 'skills')
    const ai = program.commands.find((command: Command) => command.name() === 'ai')
    const init = program.commands.find((command: Command) => command.name() === 'init')
    const createNew = program.commands.find((command: Command) => command.name() === 'new')
    const recover = program.commands.find((command: Command) => command.name() === 'recover')
    const templates = program.commands.find((command: Command) => command.name() === 'templates')
    const check = program.commands.find((command: Command) => command.name() === 'check')
    const doctor = program.commands.find((command: Command) => command.name() === 'doctor')
    const upgrade = program.commands.find((command: Command) => command.name() === 'upgrade')
    const workspaceList = workspace?.commands.find((command: Command) => command.name() === 'list')
    const envInfo = env?.commands.find((command: Command) => command.name() === 'info')
    const envSnapshot = env?.commands.find((command: Command) => command.name() === 'snapshot')
    const envPaths = env?.commands.find((command: Command) => command.name() === 'paths')
    const envSupport = env?.commands.find((command: Command) => command.name() === 'support')
    const configInspect = config?.commands.find((command: Command) => command.name() === 'inspect')
    const packageCreate = packageCommand?.commands.find((command: Command) => command.name() === 'create')

    expect(workspace?.aliases()).toEqual(['ws'])
    expect(tooling?.aliases()).toEqual(['tg'])
    expect(packageCommand?.aliases()).toEqual(['pkg'])
    expect(env?.aliases()).toEqual(['e'])
    expect(config?.aliases()).toEqual(['cfg'])
    expect(verify?.aliases()).toEqual(['v'])
    expect(skills?.aliases()).toEqual(['sk'])
    expect(ai?.aliases()).toEqual([])
    expect(init?.aliases()).toEqual([])
    expect(createNew?.aliases()).toEqual([])
    expect(recover?.aliases()).toEqual(['recover-create'])
    expect(templates?.aliases()).toEqual(['tpl'])
    expect(check?.aliases()).toEqual([])
    expect(doctor?.aliases()).toEqual([])
    expect(upgrade?.aliases()).toEqual([])
    expect(workspace?.helpInformation()).toContain('up')
    expect(workspace?.helpInformation()).toContain('ls')
    expect(tooling?.helpInformation()).toContain('i')
    expect(packageCommand?.helpInformation()).toContain('new')
    expect(env?.helpInformation()).toContain('i')
    expect(env?.helpInformation()).toContain('s')
    expect(env?.helpInformation()).toContain('p')
    expect(env?.helpInformation()).toContain('b')
    expect(env?.helpInformation()).toContain('m')
    expect(createNew?.helpInformation()).toContain('--json')
    expect(createNew?.helpInformation()).toContain('--out')
    expect(createNew?.helpInformation()).toContain('--recover')
    expect(recover?.helpInformation()).toContain('--dry-run')
    expect(recover?.helpInformation()).toContain('--json')
    expect(recover?.helpInformation()).toContain('--out')
    expect(check?.helpInformation()).toContain('--dry-run')
    expect(check?.helpInformation()).toContain('--json')
    expect(check?.helpInformation()).toContain('--markdown')
    expect(check?.helpInformation()).toContain('--out')
    expect(check?.helpInformation()).toContain('--redact')
    expect(init?.helpInformation()).toContain('--yes')
    expect(init?.helpInformation()).toContain('--overwrite')
    expect(upgrade?.helpInformation()).toContain('--yes')
    expect(upgrade?.helpInformation()).toContain('--no-overwrite')
    expect(doctor?.helpInformation()).toContain('--strict')
    expect(doctor?.helpInformation()).toContain('--markdown')
    expect(doctor?.helpInformation()).toContain('--out')
    expect(doctor?.helpInformation()).toContain('--redact')
    expect(workspaceList?.helpInformation()).toContain('--out')
    expect(workspaceList?.helpInformation()).toContain('--markdown')
    expect(workspaceList?.helpInformation()).toContain('--redact')
    expect(envInfo?.helpInformation()).toContain('--json')
    expect(envInfo?.helpInformation()).toContain('--markdown')
    expect(envInfo?.helpInformation()).toContain('--out')
    expect(envInfo?.helpInformation()).toContain('--redact')
    expect(envSnapshot?.helpInformation()).toContain('--json')
    expect(envSnapshot?.helpInformation()).toContain('--markdown')
    expect(envSnapshot?.helpInformation()).toContain('--out')
    expect(envSnapshot?.helpInformation()).toContain('--redact')
    expect(envSnapshot?.helpInformation()).toContain('--strict')
    expect(envPaths?.helpInformation()).toContain('--json')
    expect(envPaths?.helpInformation()).toContain('--markdown')
    expect(envPaths?.helpInformation()).toContain('--out')
    expect(envPaths?.helpInformation()).toContain('--redact')
    expect(envSupport?.helpInformation()).toContain('--json')
    expect(envSupport?.helpInformation()).toContain('--markdown')
    expect(envSupport?.helpInformation()).toContain('--out')
    expect(envSupport?.helpInformation()).toContain('--redact')
    expect(envSupport?.helpInformation()).toContain('--strict')
    expect(config?.helpInformation()).toContain('i')
    expect(configInspect?.helpInformation()).toContain('--json')
    expect(configInspect?.helpInformation()).toContain('--markdown')
    expect(configInspect?.helpInformation()).toContain('--out')
    expect(configInspect?.helpInformation()).toContain('--redact')
    expect(packageCreate?.helpInformation()).toContain('--json')
    expect(packageCreate?.helpInformation()).toContain('--out')
    expect(templates?.helpInformation()).toContain('--markdown')
    expect(templates?.helpInformation()).toContain('--check')
    expect(verify?.helpInformation()).toContain('push')
    expect(skills?.helpInformation()).toContain('s')
    expect(ai?.helpInformation()).toContain('prompt')
  })
})
