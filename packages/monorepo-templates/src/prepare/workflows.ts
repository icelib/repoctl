import YAML from 'yaml'
import { isSourceOnlyScript } from './published'

function sourceCommand(command: string) {
  // A source step must contain simple commands; shell composition needs separate steps.
  if (/[;&|`$<>]/u.test(command)) {
    return false
  }
  const script = /^pnpm\s+(?:--[\w-]+(?:=[\w./:-]+)?\s+)*(?:run\s+(?:--[\w-]+(?:=[\w./:-]+)?\s+)*)?([\w:-]+)(?:\s|$)/u.exec(command)?.[1]
  return (script !== undefined && isSourceOnlyScript(script))
    || /^pnpm\s+exec\s+playwright\s+install(?:\s|$)/u.test(command)
}

function mentionsSourceCommand(command: string) {
  return command.split(/[^\w:-]+/u).some(isSourceOnlyScript)
    || /\bplaywright\s+install\b/u.test(command)
}

/** Filter YAML steps, so neighboring steps and additional fields cannot escape publication rules. */
export function sanitizePublishedCiWorkflowContent(content: string) {
  const document = YAML.parseDocument(content)
  if (document.errors.length) {
    throw new Error('Cannot publish an invalid CI workflow.')
  }
  const jobs = document.get('jobs', true)
  if (!YAML.isMap(jobs)) {
    return content
  }
  let changed = false
  for (const { value: job } of jobs.items) {
    if (!YAML.isMap(job)) {
      continue
    }
    const steps = job.get('steps', true)
    if (!YAML.isSeq(steps)) {
      continue
    }
    for (let index = steps.items.length - 1; index >= 0; index--) {
      const step = steps.items[index]
      const run = YAML.isMap(step) ? step.get('run') : undefined
      if (typeof run !== 'string') {
        continue
      }
      const commands = run.split(/\r?\n/u).map(line => line.trim()).filter(line => line && !line.startsWith('#'))
      if (!commands.some(mentionsSourceCommand)) {
        continue
      }
      if (!commands.every(sourceCommand)) {
        throw new Error('Move source-only commands into separate CI steps before publishing templates.')
      }
      steps.delete(index)
      changed = true
    }
  }
  return changed ? document.toString({ lineWidth: 0 }) : content
}
