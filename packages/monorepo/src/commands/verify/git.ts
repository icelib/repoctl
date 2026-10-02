import process from 'node:process'

export function readChangedPaths(output: string) {
  const fields = output.split('\0')
  const paths: string[] = []
  for (let index = 0; index < fields.length && fields[index];) {
    const status = fields[index++]!
    const count = status.startsWith('R') || status.startsWith('C') ? 2 : 1
    for (let pathIndex = 0; pathIndex < count; pathIndex++) {
      const file = fields[index++]
      if (file) {
        paths.push(file)
      }
    }
  }
  return paths
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
  return output
}
