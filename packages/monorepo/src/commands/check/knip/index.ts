import type { KnipCheckOptions, KnipCheckReport } from '../../../types/knip'

// Load analysis only after an explicit Knip action; ordinary checks keep their current path.
export async function planKnipCheck(cwd: string, options: KnipCheckOptions = {}) {
  return (await import('./plan')).planKnipCheck(cwd, options)
}

export async function runKnipCheck(cwd: string, options: KnipCheckOptions = {}) {
  return (await import('./run')).runKnipCheck(cwd, options)
}

export async function getKnipConfigurationSuggestions(cwd: string) {
  return (await import('./config')).getKnipConfigurationSuggestions(cwd)
}

export async function saveKnipBaseline(cwd: string, report: KnipCheckReport, file: string) {
  return (await import('./save')).saveKnipBaseline(cwd, report, file)
}
