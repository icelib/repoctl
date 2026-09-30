import path from 'node:path'

const skipDirs = new Set([
  'node_modules',
  'dist',
  '.turbo',
  '.cache',
  '.vite',
  '.tmp',
  '.vue-global-types',
  '.wrangler',
  '.astro',
  '.nimbus',
])

const skipFiles = new Set([
  '.DS_Store',
  'CHANGELOG.md',
  'route-map.d.ts',
  'worker-configuration.d.ts',
])

export function shouldSkipTemplatePath(rootDir: string, targetPath: string) {
  const basename = path.basename(targetPath)
  if (skipFiles.has(basename)) {
    return true
  }
  if (basename.endsWith('.tsbuildinfo')) {
    return true
  }
  if (/\.timestamp-\d+-[a-z0-9]+\.mjs$/i.test(basename)) {
    return true
  }
  const relative = path.relative(rootDir, targetPath)
  if (!relative || relative.startsWith('..')) {
    return false
  }
  const segments = relative.split(path.sep)
  if (segments.some(segment => skipDirs.has(segment))) {
    return true
  }
  for (let i = 0; i < segments.length - 1; i += 1) {
    if (segments[i] === '.vitepress' && segments[i + 1] === 'cache') {
      return true
    }
  }
  return false
}

export function createTemplateCopyFilter(rootDir: string) {
  return (src: string) => !shouldSkipTemplatePath(rootDir, src)
}
