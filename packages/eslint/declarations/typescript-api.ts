import ts from 'typescript'

/** Keep bundled parser declarations on the compiler API used by the ESLint runtime. */
export function bindTypeScriptApi(source: string) {
  const file = ts.createSourceFile('index.d.ts', source, ts.ScriptTarget.Latest, true)
  const specifiers: ts.StringLiteral[] = []
  function visit(node: ts.Node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier)
    }
    else if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) {
      specifiers.push(node.name)
    }
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      specifiers.push(node.argument.literal)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  for (const specifier of specifiers.reverse()) {
    if (specifier.text === 'typescript' || specifier.text.startsWith('typescript/')) {
      const start = specifier.getStart(file) + 1
      const subpath = specifier.text.slice('typescript'.length)
      const extension = subpath === '/lib/tsserverlibrary' ? '.js' : ''
      source = `${source.slice(0, start)}@typescript/typescript6${subpath}${extension}${source.slice(specifier.end - 1)}`
    }
  }
  return source
}
