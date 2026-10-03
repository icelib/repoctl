/** Verify the built-in prerelease migration against committed workspace membership. */
export function validateMaintenanceLanes({ read, sourcePaths, operation, tag, Buffer, fail }) {
  const reject = () => fail('migration prerelease lanes require canonical workspace evidence and every public package tag')
  const scalar = (value) => {
    const text = value.trim()
    if (/^'[^']*'$/u.test(text)) {
      return text.slice(1, -1)
    }
    if (text.startsWith('"')) {
      try {
        const parsed = JSON.parse(text)
        if (typeof parsed === 'string') {
          return parsed
        }
      }
      catch {
        reject()
      }
    }
    if (!text || /[\s#&*!|>{}[\]]/u.test(text) || /^(?:null|true|false|~|[-+]?(?:\d|\.\d)|[-+]?\.inf|\.nan)/iu.test(text)) {
      reject()
    }
    return text
  }
  const original = read('pnpm-workspace.yaml')
  if (!original || !operation || !['add', 'modify', 'identical'].includes(operation.status)) {
    reject()
  }
  const lines = original.toString().split('\n').filter(line => line.trim() && !line.trimStart().startsWith('#'))
  const declarations = lines.map((line, index) => ({ line, index })).filter(item => /^(?:packages|'packages'|"packages"):/u.test(item.line))
  if (declarations.length !== 1) {
    reject()
  }
  const declaration = declarations[0]
  const inline = declaration.line.slice(declaration.line.indexOf(':') + 1).trim()
  const patterns = []
  if (inline !== '[]') {
    if (inline) {
      reject()
    }
    for (let index = declaration.index + 1; index < lines.length && /^\s/u.test(lines[index]); index++) {
      const match = /^ {2}- (.+)$/u.exec(lines[index])
      if (!match) {
        reject()
      }
      patterns.push(scalar(match[1]))
    }
  }
  const pattern = (value) => {
    if (!/^[!\w@./*?-]+$/u.test(value) || value.startsWith('/') || value.split('/').some(part => part === '..' || part === '.')) {
      reject()
    }
    let source = ''
    for (let index = 0; index < value.length; index++) {
      const char = value[index]
      if (char === '*' && value[index + 1] === '*') {
        index++
        if (value[index + 1] === '/') {
          index++
          source += '(?:.*/)?'
        }
        else {
          source += '.*'
        }
      }
      else if (char === '*') {
        source += '[^/]*'
      }
      else if (char === '?') {
        source += '[^/]'
      }
      else {
        source += char.replace(/[.+^$()|[\]{}\\]/gu, '\\$&')
      }
    }
    return new RegExp(`^${source}$`, 'u')
  }
  const include = patterns.filter(value => !value.startsWith('!')).map(pattern)
  const exclude = patterns.filter(value => value.startsWith('!')).map(value => pattern(value.slice(1)))
  const names = []
  for (const filename of sourcePaths) {
    const manifestPath = /^(.*)\/package\.(json|json5|yaml)$/u.exec(filename)
    if (!manifestPath || filename.split('/').some(part => ['node_modules', 'bower_components'].includes(part))) {
      continue
    }
    const directory = manifestPath[1]
    if (!include.some(regex => regex.test(directory)) || exclude.some(regex => regex.test(directory))) {
      continue
    }
    if (manifestPath[2] !== 'json') {
      reject()
    }
    let manifest
    try {
      manifest = JSON.parse(read(filename).toString())
    }
    catch {
      reject()
    }
    if (manifest && !manifest.private && typeof manifest.name === 'string' && manifest.name) {
      names.push(manifest.name)
    }
  }
  if (new Set(names).size !== names.length) {
    reject()
  }
  const output = operation.content === null ? original : Buffer.from(operation.content, 'base64')
  const outputLines = output.toString().split('\n').filter(line => line.trim() && !line.trimStart().startsWith('#'))
  const versioning = outputLines.map((line, index) => ({ line, index })).filter(item => /^(?:versioning|'versioning'|"versioning"):/u.test(item.line))
  if (versioning.length !== 1 || !/^versioning:\s*$/u.test(versioning[0].line)) {
    reject()
  }
  const section = []
  for (let index = versioning[0].index + 1; index < outputLines.length && /^\s/u.test(outputLines[index]); index++) {
    section.push(outputLines[index])
  }
  const lanes = section.map((line, index) => ({ line, index })).filter(item => /^ {2}(?:lanes|'lanes'|"lanes"):/u.test(item.line))
  if (lanes.length !== 1) {
    reject()
  }
  const laneLine = lanes[0]
  const empty = /^ {2}lanes: \{\}\s*$/u.test(laneLine.line)
  if (!empty && !/^ {2}lanes:\s*$/u.test(laneLine.line)) {
    reject()
  }
  const tags = new Map()
  for (let index = empty ? section.length : laneLine.index + 1; index < section.length && /^ {4}/u.test(section[index]); index++) {
    const match = /^ {4}("[^"]+"|'[^']+'|[^:'"\s][^:]*): (.+)$/u.exec(section[index])
    if (!match) {
      reject()
    }
    const name = scalar(match[1])
    if (tags.has(name)) {
      reject()
    }
    tags.set(name, scalar(match[2]))
  }
  if (names.some(name => tags.get(name) !== tag)) {
    reject()
  }
}
