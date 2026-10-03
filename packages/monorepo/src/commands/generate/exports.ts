import type { BindingName } from 'typescript'
import path from 'pathe'
import { loadCompiler } from '../project-references/compiler'

export function updateGeneratorExports(workspace: string, barrel: string, original: string, source: string, symbol: string, vue: boolean) {
  const ts = loadCompiler(workspace)
  const parsed = ts.createSourceFile(barrel, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  if ((parsed as typeof parsed & { parseDiagnostics: unknown[] }).parseDiagnostics.length) {
    throw new Error(`Cannot update invalid TypeScript barrel: ${barrel}`)
  }
  const relative = path.relative(path.dirname(barrel), source)
  const specifier = (relative.startsWith('.') ? relative : `./${relative}`).replace(/\.(?:ts|tsx)$/, '')
  const hasBinding = (name: BindingName): boolean => ts.isIdentifier(name) ? name.text === symbol : name.elements.some(element => ts.isBindingElement(element) && hasBinding(element.name))
  let existing = false
  let insertBefore: typeof parsed.statements[number] | undefined
  for (const statement of parsed.statements) {
    if (ts.isExportAssignment(statement) && statement.isExportEquals) {
      throw new Error(`Cannot add named exports to a CommonJS export assignment: ${barrel}`)
    }
    if (ts.isExportDeclaration(statement)) {
      const module = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : undefined
      if (module && module.localeCompare(specifier, 'en', { numeric: true }) > 0 && !insertBefore) {
        insertBefore = statement
      }
      if (!statement.exportClause) {
        throw new Error(`Cannot prove export names behind export * in ${barrel}; omit --export and update the barrel manually.`)
      }
      if (ts.isNamedExports(statement.exportClause)) {
        for (const entry of statement.exportClause.elements) {
          if (entry.name.text === symbol) {
            const expected = vue ? 'default' : symbol
            if (module !== specifier || (entry.propertyName?.text ?? entry.name.text) !== expected || entry.isTypeOnly || statement.isTypeOnly) {
              throw new Error(`Export name already exists in ${barrel}: ${symbol}`)
            }
            existing = true
          }
        }
      }
      else if (statement.exportClause.name.text === symbol) {
        throw new Error(`Export name already exists in ${barrel}: ${symbol}`)
      }
    }
    else if (ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      const named = statement as typeof statement & { name?: { text?: string } }
      const variable = ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => hasBinding(declaration.name))
      if (named.name?.text === symbol || variable) {
        throw new Error(`Export name already exists in ${barrel}: ${symbol}`)
      }
    }
  }
  if (existing) {
    return original
  }
  const newline = original.includes('\r\n') ? '\r\n' : '\n'
  const declaration = ts.factory.createExportDeclaration(undefined, false, ts.factory.createNamedExports([ts.factory.createExportSpecifier(false, vue ? ts.factory.createIdentifier('default') : undefined, ts.factory.createIdentifier(symbol))]), ts.factory.createStringLiteral(specifier, true))
  const printed = ts.createPrinter({ newLine: newline === '\r\n' ? ts.NewLineKind.CarriageReturnLineFeed : ts.NewLineKind.LineFeed, omitTrailingSemicolon: true }).printNode(ts.EmitHint.Unspecified, declaration, parsed)
  if (insertBefore) {
    const comments = ts.getLeadingCommentRanges(original, insertBefore.getFullStart()) ?? []
    const start = comments[0]?.pos ?? insertBefore.getStart(parsed)
    const position = original.lastIndexOf('\n', start - 1) + 1
    if (original.slice(position, start).trim()) {
      throw new Error(`Cannot safely insert an export into a compact barrel: ${barrel}`)
    }
    return `${original.slice(0, position)}${printed}${newline}${original.slice(position)}`
  }
  return `${original}${original && !original.endsWith('\n') ? newline : ''}${printed}${newline}`
}
