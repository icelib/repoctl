import path from 'node:path'

/** 产物和 Git tree 使用逻辑路径；只在文件系统边界转换分隔符。 */
export function sourceRelativePath(value: unknown): string {
  if (typeof value !== 'string' || !value || path.posix.isAbsolute(value) || path.win32.isAbsolute(value)
    || /[\\:\p{Cc}]/u.test(value) || value.split('/').some(part => !part || part === '.' || part === '..' || ['.git', 'node_modules'].includes(part.toLowerCase()))) {
    throw new Error('Snapshot source paths must be canonical relative paths without Git or node_modules components.')
  }
  return value
}

export function sourcePath(directory: string, relative: string) {
  return path.join(directory, ...sourceRelativePath(relative).split('/'))
}
