import type { WorkspaceGraph } from '../../../core/workspace-graph'
import type { AffectedCheckCommand, AffectedPackage } from './types'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { localize } from '../../../i18n'
import { includeBuildPrerequisites } from './selection'

const stages = ['build', 'lint', 'typecheck', 'tsd', 'test']
const globCharacters = /[*?[\]{}!()+@]/g

function readScripts(cwd: string, directory = '.') {
  const filename = path.join(cwd, directory, 'package.json')
  if (directory === '.' && !existsSync(filename)) {
    return new Set<string>()
  }
  const data = JSON.parse(readFileSync(filename, 'utf8')) as { scripts?: Record<string, unknown> }
  return new Set(Object.entries(data.scripts ?? {}).filter(([, value]) => typeof value === 'string' && value.trim()).map(([name]) => name))
}

function printCommand(args: string[]) {
  return ['pnpm', ...args].map(arg => /^[\w@./:=+-]+$/.test(arg) ? arg : `'${arg.replaceAll('\'', '\'\\\'\'')}'`).join(' ')
}

/** Snapshot script capabilities once so matrix jobs share the original plan's inputs. */
export function createAffectedCommandPlanner(graph: WorkspaceGraph) {
  const scripts = new Map(graph.nodes.map(node => [node.id, readScripts(graph.workspaceDir, node.id)]))
  const rootScripts = readScripts(graph.workspaceDir)
  return (packages: AffectedPackage[], full: boolean, filtered: boolean): AffectedCheckCommand[] => {
    const selected = packages.filter(pkg => pkg.selected).map(pkg => pkg.id)
    const buildTargets = includeBuildPrerequisites(graph, selected)
    return stages.map((name) => {
      const root = full && !filtered && rootScripts.has(name)
      const candidates = name === 'build' ? buildTargets : selected
      const targets = root ? ['.'] : candidates.filter(id => scripts.get(id)?.has(name))
      const missingTargets = root ? [] : candidates.filter(id => !scripts.get(id)?.has(name))
      const args = !targets.length
        ? []
        : root
          ? [name]
          : ['--recursive', ...targets.map(id => `--filter=./${id.replace(globCharacters, value => `[${value}]`).replace(/\.$/, '[.]')}`), '--fail-if-no-match', '--if-present', 'run', name]
      const command: AffectedCheckCommand = {
        name,
        command: targets.length ? printCommand(args) : '',
        description: root
          ? localize(`Run the root ${name} script for full verification.`, `运行根 ${name} 脚本进行全量校验。`)
          : localize(`Run ${name} in ${targets.length} workspace packages.`, `在 ${targets.length} 个 workspace 包中运行 ${name}。`),
        executable: 'pnpm',
        args,
        scope: root ? 'root' : 'packages',
        targets,
        missingTargets,
        prerequisiteTargets: root ? [] : targets.filter(id => !selected.includes(id)),
      }
      if (!targets.length) {
        command.skipReason = candidates.length
          ? 'missing_script'
          : packages.some(pkg => pkg.skippedReason === 'filtered_out') ? 'filter_intersection_empty' : 'no_affected_packages'
      }
      return command
    })
  }
}
