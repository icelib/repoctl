import type { DoctorFixOperation } from './types'
import { hash, record } from '../../deps/files'
import { recommendedRepoScripts } from '../tooling'

/** Existing keys, including malformed/empty values, always remain user-owned. */
export function planMissingRootScripts(original: string): { operation?: DoctorFixOperation, notes: string[] } {
  let manifest: Record<string, unknown> | undefined
  try {
    manifest = record(JSON.parse(original.replace(/^\uFEFF/, '')))
  }
  catch {}
  if (!manifest) {
    return { notes: ['package.json must be a valid JSON object; repair it manually.'] }
  }
  const scripts = manifest['scripts'] === undefined ? {} : record(manifest['scripts'])
  if (!scripts) {
    return { notes: ['scripts is not an object; repair it manually before adding recommended scripts.'] }
  }
  const additions = Object.entries(recommendedRepoScripts)
    .filter(([name]) => !Object.hasOwn(scripts, name))
    .map(([name, command]) => ({ name, command }))
  const preserved = Object.entries(recommendedRepoScripts).filter(([name, command]) => Object.hasOwn(scripts, name) && scripts[name] !== command).map(([name]) => name)
  const notes = preserved.length ? [`Existing script values preserved: ${preserved.join(', ')}.`] : []
  if (!additions.length) {
    return { notes }
  }
  manifest['scripts'] = { ...scripts, ...Object.fromEntries(additions.map(({ name, command }) => [name, command])) }
  const indentation = original.match(/\n([\t ]+)"/)?.[1] ?? '  '
  const newline = original.includes('\r\n') ? '\r\n' : '\n'
  const after = `${original.startsWith('\uFEFF') ? '\uFEFF' : ''}${JSON.stringify(manifest, null, indentation).replaceAll('\n', newline)}${original.endsWith('\n') ? newline : ''}`
  const diff = ['--- a/package.json', '+++ b/package.json', ...original.split(/\r?\n/).map(line => `-${line}`), ...after.split(/\r?\n/).map(line => `+${line}`)].join('\n')
  return {
    operation: { id: 'add-missing-root-scripts', rule: 'root-scripts', risk: 'low', path: 'package.json', before: original, beforeHash: hash(original), after, afterHash: hash(after), additions, diff },
    notes,
  }
}
