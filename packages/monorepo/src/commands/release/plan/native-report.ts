import type { ReleaseNoteDocument } from '../notes/model'
import type { ReleasePlan, ReleasePlanOptions, ReleasePlanPackage } from './types'
import { readFile } from 'node:fs/promises'
import path from 'pathe'
import { clearWorkspaceCache, getWorkspaceData } from '../../../core/workspace'
import { isIntentConsumed, parseIntent, readLedger, readPendingIntents } from '../intents'
import { buildEntries } from '../notes/entries'
import { parseIntentSummary } from '../notes/model'
import { readLaneAssignments } from '../shared'
import { nativePlan, PlanError } from './native'

function createNotes(packages: ReleasePlanPackage[]): ReleaseNoteDocument {
  return {
    packages: packages.map(pkg => ({ name: pkg.name, version: pkg.newVersion, previousVersion: pkg.currentVersion })),
    entries: packages.flatMap((pkg) => {
      const prose = pkg.intents.map(intent => `### ${intent.bump} Changes\n\n- ${intent.summary}`).join('\n\n')
      const propagated = pkg.reasons.filter(reason => reason !== 'intent')
      const content = [prose, ...(propagated.length ? [`### Dependencies\n\n- Native pnpm propagation: ${propagated.join(', ')}.`] : [])].filter(Boolean).join('\n\n')
      return buildEntries({ name: pkg.name, version: pkg.newVersion, content }, [])
    }),
    contributors: [],
    compareUrls: [],
  }
}

/** Preview unconsumed intents without hooks, Git writes, installation or publication. */
export function emptyReleasePlan(options: ReleasePlanOptions): ReleasePlan {
  return {
    schemaVersion: 1,
    branchRule: null,
    cwd: path.resolve(options.cwd),
    pnpmVersion: null,
    nativeFormat: null,
    status: 'empty',
    packages: [],
    blockers: [],
    notes: { packages: [], entries: [], contributors: [], compareUrls: [] },
  }
}

/** Shared native report for formal plans and isolated snapshot preparation. No branch policy or hooks. */
export async function createNativeReleasePlan(options: ReleasePlanOptions): Promise<ReleasePlan> {
  const report = emptyReleasePlan(options)
  try {
    clearWorkspaceCache()
    const workspace = await getWorkspaceData(options.cwd, { ignorePrivatePackage: false, ignoreRootPackage: false })
    report.cwd = workspace.workspaceDir
    const native = nativePlan({ ...options, cwd: report.cwd })
    report.pnpmVersion = native.version
    report.nativeFormat = native.format
    const pending = await readPendingIntents(report.cwd, { includeRoot: true })
    const intents = await Promise.all(pending.map(async (filename) => {
      const content = await readFile(path.join(report.cwd, filename), 'utf8')
      return { path: filename, packages: parseIntent(content, filename), summary: parseIntentSummary(content) }
    }))
    const lanes = await readLaneAssignments(report.cwd)
    const ledger = await readLedger(report.cwd)
    const seen = new Set<string>()
    report.packages = native.packages.map((release) => {
      const candidates = workspace.packages.filter(pkg => pkg.manifest.name === release.name)
      const pkg = candidates[0]
      if (!pkg || candidates.length !== 1 || seen.has(release.name) || pkg.manifest.version !== release.currentVersion) {
        throw new PlanError('plan-manifest-mismatch', `Native release plan does not uniquely match current manifest: ${release.name}`)
      }
      seen.add(release.name)
      const directory = path.relative(report.cwd, pkg.rootDir) || '.'
      const lane = lanes[release.name] ?? lanes[directory] ?? 'main'
      return {
        ...release,
        directory,
        lane,
        private: pkg.manifest.private === true,
        publishCandidate: pkg.manifest.private !== true,
        intents: intents.flatMap((intent) => {
          if (isIntentConsumed(ledger, path.basename(intent.path, '.md'), release.name, directory, lane)) {
            return []
          }
          const bump = intent.packages.find(([ref]) => ref === release.name || (ref.replace(/^\.\//, '') || '.') === directory)?.[1]
          return bump && bump !== 'none' ? [{ path: intent.path, bump, summary: intent.summary }] : []
        }),
      }
    }).sort((a, b) => a.name.localeCompare(b.name))
    report.notes = createNotes(report.packages)
    report.status = report.packages.length ? 'ready' : 'empty'
  }
  catch (error) {
    report.status = 'blocked'
    report.packages = []
    report.blockers.push({ id: error instanceof PlanError ? error.id : 'invalid-release-input', detail: error instanceof Error ? error.message : String(error) })
  }
  return report
}
