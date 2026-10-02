import type { KnipAnalysisScope, KnipBaseline, KnipBaselineComparison, KnipFinding } from '../../../types/knip'
import { readFile, stat } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { record } from '../../deps/files'
import { findingFingerprint } from './native'

export function validateKnipBaseline(value: unknown): KnipBaseline {
  const baseline = record(value)
  const scope = record(baseline?.['scope'])
  if (!baseline || baseline['schemaVersion'] !== 1 || baseline['kind'] !== 'knip-baseline' || !scope
    || typeof scope['toolVersion'] !== 'string' || (scope['rootName'] !== null && typeof scope['rootName'] !== 'string')
    || typeof scope['production'] !== 'boolean' || typeof scope['strict'] !== 'boolean'
    || !Array.isArray(scope['workspaces']) || !scope['workspaces'].length || scope['workspaces'].some(item => typeof item !== 'string')
    || !Array.isArray(scope['configuration']) || scope['configuration'].some(item => !record(item) || typeof item.path !== 'string' || typeof item.hash !== 'string')
    || (scope['configFile'] !== null && typeof scope['configFile'] !== 'string') || !record(scope['report']) || !record(scope['plugins'])
    || !Array.isArray(baseline['findings'])) {
    throw new Error('Invalid Knip baseline schema. Regenerate it explicitly after review.')
  }
  for (const item of baseline['findings']) {
    if (!record(item) || typeof item.fingerprint !== 'string' || typeof item.type !== 'string'
      || !['error', 'warn'].includes(item.severity) || typeof item.workspace !== 'string'
      || typeof item.file !== 'string' || typeof item.symbol !== 'string' || !record(item.native)
      || item.fingerprint !== findingFingerprint(item as KnipFinding)) {
      throw new Error('Invalid Knip baseline finding or fingerprint.')
    }
  }
  if (new Set(baseline['findings'].map(item => item.fingerprint)).size !== baseline['findings'].length) {
    throw new Error('Knip baseline contains duplicate findings.')
  }
  return baseline as unknown as KnipBaseline
}

export async function readKnipBaseline(file: string) {
  if ((await stat(file)).size > 32 * 1024 * 1024) {
    throw new Error('Knip baseline exceeds 32 MiB.')
  }
  return validateKnipBaseline(JSON.parse(await readFile(file, 'utf8')))
}

export async function compareKnipBaseline(file: string | null, scope: KnipAnalysisScope, findings: KnipFinding[]): Promise<KnipBaselineComparison> {
  if (!file) {
    return { status: 'none', path: null, existing: [], added: [...findings], fixed: [] }
  }
  try {
    const baseline = await readKnipBaseline(file)
    if (!isDeepStrictEqual(baseline['scope'], scope)) {
      throw new Error('Knip baseline analysis scope changed (tool version, primary config, workspace set or enabled plugins). Review and save a new baseline explicitly.')
    }
    const previous = new Set(baseline['findings'].map(item => item.fingerprint))
    const current = new Set(findings.map(item => item.fingerprint))
    return {
      status: 'valid',
      path: file,
      existing: findings.filter(item => previous.has(item.fingerprint)),
      added: findings.filter(item => !previous.has(item.fingerprint)),
      fixed: baseline['findings'].filter(item => !current.has(item.fingerprint)),
    }
  }
  catch (error) {
    return { status: 'invalid', path: file, reason: (error as Error).message, existing: [], added: [], fixed: [] }
  }
}
