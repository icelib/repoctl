import type { EnvCacheEvidence, EnvCacheFinding, EnvCacheTask, EnvCacheVariable } from '../../types/env-cache'
import type { TaskConfiguration } from './config'
import type { Declaration } from './patterns'
import path from 'pathe'
import { finding } from './files'
import { envExcluded, envMatches, matchesFile, negativeFileMatch } from './patterns'
import { builtinGlobalEnv, builtinPassThroughEnv } from './turbo-environment'

// Framework prefixes follow Turbo's environment-variable documentation; detection is package-local.
const frameworks: Array<[string[], string[]]> = [
  [['next'], ['NEXT_PUBLIC_*']],
  [['@sveltejs/kit'], ['PUBLIC_*']],
  [['astro'], ['PUBLIC_*']],
  [['nuxt'], ['NUXT_*', 'NUXT_ENV_*']],
  [['expo'], ['EXPO_PUBLIC_*']],
  [['react-scripts'], ['REACT_APP_*']],
  [['gatsby'], ['GATSBY_*']],
  [['@remix-run/dev'], ['REMIX_*']],
  [['@solidjs/start', 'solid-start'], ['VITE_*']],
  [['@redwoodjs/core'], ['REDWOOD_ENV_*']],
  [['sanity'], ['SANITY_STUDIO_*']],
  [['vite'], ['VITE_*']],
]
const viteBuiltins = new Set(['MODE', 'BASE_URL', 'DEV', 'PROD', 'SSR'])

export function frameworkDeclarations(dependencies: string[], enabled: boolean): Declaration[] {
  const match = enabled ? frameworks.find(([names]) => names.some(name => dependencies.includes(name))) : undefined
  return (match?.[1] ?? []).map(pattern => ({ path: 'turbo:framework-inference', field: 'env', pattern }))
}

function variable(name: string, evidence: EnvCacheEvidence[], config: TaskConfiguration, inferred: Declaration[]): EnvCacheVariable {
  const hash = [...envMatches(name, [...builtinGlobalEnv, ...config.globalEnv]), ...envMatches(name, config.env)]
  if (hash.length) {
    return { name, evidence, coverage: 'hash', declarations: hash }
  }
  const framework = envExcluded(name, config.env) ? [] : envMatches(name, inferred)
  if (framework.length) {
    return { name, evidence, coverage: 'inferred', declarations: framework }
  }
  const passthrough = envExcluded(name, config.passThroughEnv) ? [] : [...envMatches(name, builtinPassThroughEnv), ...envMatches(name, config.globalPassThroughEnv), ...envMatches(name, config.passThroughEnv)]
  if (passthrough.length) {
    return { name, evidence, coverage: 'passthrough', declarations: passthrough }
  }
  if (viteBuiltins.has(name) && evidence.every(item => item.kind === 'import-meta-env') && inferred.some(item => ['VITE_*', 'PUBLIC_*'].includes(item.pattern))) {
    return { name, evidence, coverage: 'builtin', declarations: [{ path: 'framework:import-meta-env', field: 'builtin', pattern: name }] }
  }
  return { name, evidence, coverage: 'missing', declarations: [] }
}

function fileCoverage(filename: string, directory: string, config: TaskConfiguration, defaults: Set<string> | null): EnvCacheTask['files'][number]['coverage'] {
  const global = config.globalDependencies.map(item => item.pattern)
  if (!negativeFileMatch(filename, global) && matchesFile(filename, global.filter(pattern => !pattern.startsWith('!')))) {
    return 'global'
  }
  const local = path.relative(directory, filename)
  const inputs = config.inputs?.map((item) => {
    const negative = item.pattern.startsWith('!')
    const pattern = negative ? item.pattern.slice(1) : item.pattern
    return `${negative ? '!' : ''}${pattern.startsWith('$TURBO_ROOT$/') ? path.relative(directory, pattern.slice('$TURBO_ROOT$/'.length)) : pattern}`
  })
  if (inputs && negativeFileMatch(local, inputs)) {
    return 'missing'
  }
  if (inputs && matchesFile(local, inputs.filter(pattern => pattern !== '$TURBO_DEFAULT$' && !pattern.startsWith('!')))) {
    return 'task'
  }
  if (!inputs?.length || inputs.includes('$TURBO_DEFAULT$')) {
    return local.startsWith('../') ? 'missing' : defaults === null ? 'unknown' : defaults.has(filename) ? 'default' : 'missing'
  }
  return 'missing'
}

export function evaluate(pkg: string, directory: string, task: string, config: TaskConfiguration, references: Map<string, EnvCacheEvidence[]>, dynamic: EnvCacheEvidence[], files: string[], defaults: Set<string> | null, inferred: Declaration[]) {
  const result: EnvCacheTask = { package: pkg, path: directory || '.', task, cache: config.cache, variables: [...references].sort(([a], [b]) => a.localeCompare(b)).map(([name, evidence]) => variable(name, evidence, config, inferred)), dynamic, files: files.map(filename => ({ path: filename, coverage: fileCoverage(filename, directory, config, defaults) })) }
  const findings: EnvCacheFinding[] = []
  for (const item of result.variables) {
    if (['missing', 'passthrough'].includes(item.coverage)) {
      const evidence = item.evidence[0]!
      findings.push(finding(item.coverage === 'missing' ? 'env-unhashed' : 'env-passthrough', pkg, task, item.coverage === 'missing' ? 'This variable is not declared in the task hash. Review whether its value changes build output.' : 'This variable is available through passthrough but does not affect the task hash. Review whether that is intentional.', { severity: config.cache ? 'warn' : 'info', variable: item.name, path: evidence.path, line: evidence.line }))
    }
  }
  for (const evidence of dynamic) {
    findings.push(finding('env-dynamic-access', pkg, task, 'The variable name or environment-object use cannot be resolved statically.', { path: evidence.path, line: evidence.line, severity: config.cache ? 'warn' : 'info' }))
  }
  for (const file of result.files) {
    if (file.coverage === 'missing' || file.coverage === 'unknown') {
      findings.push(finding('env-file-input', pkg, task, file.coverage === 'unknown' ? 'Default input coverage could not be verified without Git metadata.' : 'This environment file is not covered by task inputs or globalDependencies.', { path: file.path, severity: config.cache ? 'warn' : 'info' }))
    }
  }
  for (const declaration of config.globalEnv.filter(item => item.pattern === '*')) {
    findings.push(finding('env-global-scope', pkg, task, 'globalEnv matches every variable and invalidates all tasks when any value changes. Review whether task-local declarations would be sufficient.', { path: declaration.path }))
  }
  return { result, findings }
}
