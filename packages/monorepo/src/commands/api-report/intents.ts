import { readFile } from 'node:fs/promises'
import path from 'pathe'
import YAML from 'yaml'
import { isIntentConsumed, parseIntent, readLedger, readPendingIntents } from '../release/intents'

/** Advisory links only: no planner, hooks, intent consumption or version inference. */
export async function publicApiIntents(root: string) {
  const pending = await readPendingIntents(root, { includeRoot: true })
  if (!pending.length) {
    return () => [] as string[]
  }
  const ledger = await readLedger(root)
  const configuration = YAML.parse(await readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8')) as { versioning?: { lanes?: Record<string, string> } }
  const files = await Promise.all(pending.map(async file => ({ file, entries: parseIntent(await readFile(path.join(root, file), 'utf8'), file) })))
  return (workspace: string, name: string | null) => files.filter(({ file, entries }) => entries.some(([reference, bump]) => {
    if (bump === 'none' || (reference !== name && reference.replace(/^\.\//u, '') !== workspace)) {
      return false
    }
    const lane = configuration.versioning?.lanes?.[name ?? ''] ?? configuration.versioning?.lanes?.[workspace]
    return !isIntentConsumed(ledger, path.basename(file, '.md'), name ?? '', workspace, lane)
  })).map(item => item.file)
}
