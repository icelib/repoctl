import process from 'node:process'

// Keep Knip's native metadata; its built-in JSON reporter drops severity/workspace.
export default function report(data) {
  const findings = []
  for (const [type, enabled] of Object.entries(data.report)) {
    if (!enabled) {
      continue
    }
    for (const issues of Object.values(data.issues[type])) {
      for (const issue of Object.values(issues)) {
        const { type, severity, filePath, workspace, symbol, symbols, parentSymbol, symbolType, specifier, pos, line, col } = issue
        findings.push({ type, severity, filePath, workspace, symbol, symbols, parentSymbol, symbolType, specifier, pos, line, col })
      }
    }
  }
  if (!data.isDisableConfigHints) {
    for (const hint of data.configurationHints) {
      findings.push({
        type: 'configurationHint',
        severity: data.isTreatConfigHintsAsErrors ? 'error' : 'warn',
        filePath: hint.filePath ?? data.configFilePath ?? data.cwd,
        workspace: hint.workspaceName ?? '.',
        symbol: `${hint.type}: ${hint.identifier}`,
        hint: { ...hint, identifier: String(hint.identifier) },
      })
    }
  }
  if (!data.isDisableTagHints) {
    for (const hint of data.tagHints) {
      findings.push({ type: 'tagHint', severity: data.isTreatTagHintsAsErrors ? 'error' : 'warn', filePath: hint.filePath, workspace: '', symbol: `${hint.tagName}: ${hint.identifier}`, hint })
    }
  }
  const output = {
    schemaVersion: 1,
    kind: 'repoctl-knip-native',
    cwd: data.cwd,
    findings,
    hasConfigLoadErrors: data.hasConfigLoadErrors,
    configFilePath: data.configFilePath ?? null,
    workspaces: data.includedWorkspaceDirs,
    report: data.report,
    plugins: data.enabledPlugins,
  }
  process.stdout.write(`\n__REPOCTL_KNIP_REPORT_V1__${JSON.stringify(output)}\n`)
}
