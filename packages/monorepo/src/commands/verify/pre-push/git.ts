import type { execFileSync } from 'node:child_process'
import process from 'node:process'

const zeroSha = '0'.repeat(40)
const whitespacePattern = /\s+/

export function getPushChangedFiles(stdin: string, cwd: string, execFile: typeof execFileSync) {
  const files = new Set<string>()
  for (const line of stdin.trim().split('\n')) {
    const [, localSha, , remoteSha] = line.trim().split(whitespacePattern)
    if (!localSha || localSha === zeroSha) {
      continue
    }

    const revisions = remoteSha && remoteSha !== zeroSha
      ? [`${remoteSha}...${localSha}`]
      : [execFile('git', ['hash-object', '-t', 'tree', '--stdin'], {
          cwd,
          encoding: 'utf8',
          input: '',
        }).trim(), localSha]
    // Treat renames as a deletion plus an addition so both owners are checked.
    // NUL delimiters preserve spaces, newlines, and non-ASCII file names.
    const output = execFile('git', ['diff', '--name-only', '--no-renames', '-z', '--relative', '--diff-filter=ACDMRT', ...revisions], {
      cwd,
      encoding: 'utf8',
    })
    for (const file of output.split('\0').filter(Boolean)) {
      files.add(file)
    }
  }
  return files
}

export async function readHookStdin() {
  if (process.stdin.isTTY) {
    return ''
  }

  process.stdin.setEncoding('utf8')
  let output = ''
  try {
    for await (const chunk of process.stdin) {
      output += chunk
    }
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EAGAIN') {
      throw error
    }
  }
  return output.trim()
}
