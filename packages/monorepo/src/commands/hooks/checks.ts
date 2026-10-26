import type { GitHookCheck } from './types'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import YAML from 'yaml'

const jobPrefix = 'repoctl-domain:'

/** Modify native jobs only; Lefthook remains responsible for index protection. */
export async function prepareHookChecks(cwd: string, checks: GitHookCheck[] | undefined) {
  const filename = path.join(cwd, 'lefthook.yml')
  const content = await readFile(filename, 'utf8')
  const document = YAML.parseDocument(content)
  if (document.errors.length) {
    throw new Error('Could not parse lefthook.yml.')
  }
  if (checks === undefined) {
    return { filename, content, updated: content, names: [] as string[] }
  }
  const names = new Set<string>()
  for (const check of checks) {
    if (!check.name.trim() || !check.run.trim() || names.has(check.name)) {
      throw new Error('Hook checks require unique non-empty names and commands.')
    }
    names.add(check.name)
  }
  const jobs = document.getIn(['pre-commit', 'jobs'])
  if (!YAML.isSeq(jobs) || document.getIn(['pre-commit', 'piped']) !== true) {
    throw new Error('Hook checks require native pre-commit piped jobs in lefthook.yml.')
  }
  const retained = jobs.items.filter(job => !(YAML.isMap(job) && String(job.get('name')).startsWith(jobPrefix)))
  const final = retained.at(-1)
  if (!YAML.isMap(final) || final.get('run') !== 'pnpm exec repo verify staged-typecheck') {
    throw new Error('Hook checks require the final native job to run pnpm exec repo verify staged-typecheck.')
  }
  const additions = checks.map(check => document.createNode({
    name: `${jobPrefix}${check.name}`,
    ...(check.glob === undefined ? {} : { glob: check.glob }),
    run: check.run,
    ...(check.stageFixed === undefined ? {} : { stage_fixed: check.stageFixed }),
  }))
  jobs.items = [...retained.slice(0, -1), ...additions, final]
  return { filename, content, updated: document.toString(), names: [...names] }
}

export async function applyHookChecks(plan: Awaited<ReturnType<typeof prepareHookChecks>>) {
  if (plan.updated !== plan.content) {
    await writeFile(plan.filename, plan.updated)
  }
}
