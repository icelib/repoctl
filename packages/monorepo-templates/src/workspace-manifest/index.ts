export interface WorkspaceManifest {
  name?: string
  packageManager?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  [key: string]: unknown
}

export interface WorkspaceManifestOptions {
  name?: string
  packageManager?: string
}

// Consumer commands are a product contract. New source-workspace scripts must
// be deliberately added here instead of silently leaking into generated apps.
const workspaceScripts: Record<string, string> = {
  'build': 'turbo run build',
  'dev': 'turbo run dev --concurrency=20',
  'test': 'vitest run --passWithNoTests && pnpm test:types',
  'test:dev': 'vitest --passWithNoTests',
  'test:types': 'turbo run test:types',
  'lint': 'turbo run lint',
  'typecheck': 'turbo run typecheck',
  'tsd': 'turbo run tsd',
  'format': 'eslint . --fix',
  'validate': 'pnpm build && pnpm lint && pnpm typecheck && pnpm tsd && pnpm test',
  'release': 'pnpm change',
  'version-packages': 'pnpm version -r',
  'publish-packages': 'repo release stable publish',
  'release:pre': 'repo release pre publish',
  'preinstall': 'npx only-allow pnpm',
  'prepare': 'husky',
  'postinstall': 'pnpm build',
  'commit': 'commit',
  'commitlint': 'commitlint --edit',
  'repo:init': 'repo init',
  'repo:new': 'repo new',
  'repo:check': 'repo check',
  'repo:doctor': 'repo doctor',
  'pr:alpha': 'repo release pre enter alpha',
  'pr:beta': 'repo release pre enter beta',
  'pr:rc': 'repo release pre enter rc',
  'pr:next': 'repo release pre enter next',
  'pr:exit': 'repo release pre exit',
}

/** Create the portable root manifest shared by published assets and bootstrap. */
export function createWorkspaceManifest(source: WorkspaceManifest, options: WorkspaceManifestOptions = {}): WorkspaceManifest {
  const manifest: WorkspaceManifest = { ...source, ...options, scripts: { ...workspaceScripts } }
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies'] as const) {
    if (!source[field]) {
      continue
    }
    manifest[field] = Object.fromEntries(Object.entries(source[field]).filter(([name]) => name !== '@icebreakers/monorepo').map(([name, version]) => [
      name,
      version.startsWith('workspace:') ? 'latest' : version,
    ]))
  }
  manifest.devDependencies = { ...manifest.devDependencies, repoctl: 'latest' }
  return manifest
}
