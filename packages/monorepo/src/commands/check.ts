import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { loadMonorepoConfig } from '../core/config'
import { localize } from '../i18n'
import fs from '../utils/fs'
import { verifyCommitMsg, verifyPreCommit, verifyStagedTypecheck } from './verify'

export interface RecommendedCheckOptions {
  cwd: string
  full?: boolean
  staged?: boolean
  editFile?: string
  spawn?: typeof spawnSync
}

export type RecommendedCheckMode = 'commit-msg' | 'full' | 'staged' | 'default'

export interface RecommendedCheckPlanCommand {
  name: string
  command: string
  description: string
  available?: boolean
}

export interface RecommendedCheckPlan {
  cwd: string
  mode: RecommendedCheckMode
  commands: RecommendedCheckPlanCommand[]
}

export function resolveRecommendedCheckPlan(options: RecommendedCheckOptions): RecommendedCheckPlan {
  const { cwd, full, staged, editFile } = options

  if (editFile) {
    return {
      cwd,
      mode: 'commit-msg',
      commands: [
        {
          name: 'commit-msg',
          command: `repo verify commit-msg ${editFile}`,
          description: localize('Validate a commit message file.', '校验 commit message 文件是否符合提交规范。'),
        },
      ],
    }
  }

  if (full) {
    return {
      cwd,
      mode: 'full',
      commands: [
        {
          name: 'pre-push',
          command: 'repo verify pre-push',
          description: localize('Run full pre-push verification with lint, typecheck, build, test, and tsd.', '执行完整 pre-push 校验，包含整仓 lint/typecheck，并按变更范围运行 build/test/tsd。'),
        },
      ],
    }
  }

  if (staged) {
    return {
      cwd,
      mode: 'staged',
      commands: [
        {
          name: 'pre-commit',
          command: 'repo verify pre-commit',
          description: localize('Run pre-commit verification.', '执行 pre-commit 校验。'),
        },
        {
          name: 'staged-typecheck',
          command: 'repo verify staged-typecheck <staged files>',
          description: localize('Route typecheck to workspaces containing staged TypeScript or Vue files.', '按暂存 TypeScript/Vue 文件所在 workspace 路由 typecheck。'),
        },
      ],
    }
  }

  return {
    cwd,
    mode: 'default',
    commands: [
      {
        name: 'pre-commit',
        command: 'repo verify pre-commit',
        description: localize('Run the default lightweight local verification.', '执行默认轻量本地校验。'),
      },
    ],
  }
}

export function getKnownRepoCheckCommands() {
  return new Set([
    'repo verify pre-commit',
    'repo verify pre-push',
    'repo verify staged-typecheck',
    'repo verify commit-msg',
  ])
}

function hasRootScript(pkgJson: { scripts?: Record<string, unknown> }, name: string) {
  return typeof pkgJson.scripts?.[name] === 'string' && pkgJson.scripts[name].length > 0
}

async function readRootScripts(cwd: string) {
  const pkgJsonPath = `${cwd}/package.json`
  if (!await fs.pathExists(pkgJsonPath)) {
    return {}
  }
  const pkgJson = await fs.readJson<{ scripts?: Record<string, unknown> }>(pkgJsonPath)
  return pkgJson.scripts ?? {}
}

export async function resolveFullWorkspaceCheckPlan(cwd: string): Promise<RecommendedCheckPlan> {
  const scripts = await readRootScripts(cwd)
  const commands: RecommendedCheckPlanCommand[] = ['lint', 'typecheck', 'test', 'build']
    .filter(name => hasRootScript({ scripts }, name))
    .map(name => ({
      name,
      command: `pnpm ${name}`,
      description: localize(`Run the ${name} script from the root package.json.`, `运行根 package.json 的 ${name} 脚本。`),
      available: true,
    }))

  return {
    cwd,
    mode: 'full',
    commands,
  }
}

export async function runFullWorkspaceCheck(cwd: string, spawn: typeof spawnSync = spawnSync) {
  await loadMonorepoConfig(cwd)
  const plan = await resolveFullWorkspaceCheckPlan(cwd)

  for (const command of plan.commands) {
    process.stdout.write(`[check:${command.name}] .\n`)
    const result = spawn('pnpm', [command.name], {
      cwd,
      stdio: 'inherit',
    })
    if (result.status !== 0) {
      process.exit(result.status ?? 1)
    }
  }
}

export async function runRecommendedCheck(options: RecommendedCheckOptions) {
  const { cwd, full, staged, editFile, spawn } = options

  if (editFile) {
    await verifyCommitMsg({ cwd, editFile })
    return
  }

  if (full) {
    await runFullWorkspaceCheck(cwd, spawn)
    return
  }

  if (staged) {
    await verifyPreCommit({ cwd })
    verifyStagedTypecheck([], { cwd })
    return
  }

  await verifyPreCommit({ cwd })
}
