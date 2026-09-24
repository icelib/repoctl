import path from 'node:path'
import process from 'node:process'

export function formatNextSteps(targetDir: string, cwd = process.cwd(), heading = 'Workspace created. Next steps:') {
  const relative = path.relative(cwd, targetDir) || '.'
  return [
    '',
    heading,
    `  cd ${relative}`,
    '  corepack enable',
    '  pnpm install',
    '  pnpm exec repo init',
    '  pnpm exec repo doctor',
    '  pnpm exec repo check',
    '',
  ].join('\n')
}
