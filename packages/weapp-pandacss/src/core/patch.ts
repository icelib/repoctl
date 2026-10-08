import fs from 'node:fs/promises'
import * as t from '@babel/types'

import { generate, parse } from '@/babel'

const defaultWrapperSpecifier = './weapp-panda/index.mjs'
const markerPrefix = '__weappPandaOriginal_'

function member(object: string, property: string) {
  return t.memberExpression(t.identifier(object), t.identifier(property))
}

function spreadCall(callee: t.Expression, argument: string) {
  return t.callExpression(callee, [
    t.spreadElement(t.identifier(argument)),
  ])
}

function createFactoryWrapper(factoryName: 'createCss' | 'createSerializeCss') {
  const markerName = `${markerPrefix}${factoryName}`
  const factoryArgs = t.identifier('factoryArgs')
  const styles = t.identifier('styles')
  const originalFactory = t.identifier(markerName)
  const serializer = t.identifier('serializer')
  const wrapped = t.identifier('wrapped')

  const serializerCall = spreadCall(serializer, 'styles')
  const escapedSerializerCall = t.callExpression(
    t.identifier('escape'),
    [serializerCall],
  )

  const wrapperBody = t.blockStatement([
    t.variableDeclaration('const', [
      t.variableDeclarator(
        serializer,
        spreadCall(originalFactory, 'factoryArgs'),
      ),
    ]),
    t.variableDeclaration('const', [
      t.variableDeclarator(
        wrapped,
        t.arrowFunctionExpression(
          [t.restElement(styles)],
          escapedSerializerCall,
        ),
      ),
    ]),
    t.returnStatement(
      t.callExpression(member('Object', 'defineProperties'), [
        wrapped,
        t.callExpression(member('Object', 'getOwnPropertyDescriptors'), [serializer]),
      ]),
    ),
  ])

  return {
    markerName,
    markerDeclaration: t.variableDeclaration('const', [
      t.variableDeclarator(originalFactory, t.identifier(factoryName)),
    ]),
    assignment: t.expressionStatement(
      t.assignmentExpression(
        '=',
        t.identifier(factoryName),
        t.functionExpression(
          null,
          [t.restElement(factoryArgs)],
          wrapperBody,
        ),
      ),
    ),
  }
}

function hasEscapeImport(program: t.Program, source: string) {
  return program.body.some((node) => {
    if (node.type !== 'ImportDeclaration' || node.source.value !== source) {
      return false
    }
    return node.specifiers.some((specifier) => {
      return specifier.type === 'ImportSpecifier'
        && specifier.imported.type === 'Identifier'
        && specifier.imported.name === 'escape'
    })
  })
}

function addEscapeImport(program: t.Program, source: string) {
  if (hasEscapeImport(program, source)) {
    return
  }

  program.body.unshift(
    t.importDeclaration(
      [
        t.importSpecifier(
          t.identifier('escape'),
          t.identifier('escape'),
        ),
      ],
      t.stringLiteral(source),
    ),
  )
}

function hasMarker(program: t.Program, markerName: string) {
  return program.body.some((node) => {
    if (node.type !== 'VariableDeclaration') {
      return false
    }
    return node.declarations.some((declaration) => {
      return declaration.id.type === 'Identifier'
        && declaration.id.name === markerName
    })
  })
}

function hasFactory(program: t.Program, factoryName: string) {
  return program.body.some((node) => {
    if (node.type === 'FunctionDeclaration') {
      return node.id?.name === factoryName
    }
    if (node.type === 'ExportNamedDeclaration') {
      return node.declaration?.type === 'FunctionDeclaration'
        && node.declaration.id?.name === factoryName
    }
    return false
  })
}

/**
 * Inject the mini-program selector escape into Panda's generated helpers.
 *
 * Panda 0.x exposed `createCss`; Panda 2 exposes `createSerializeCss`.
 * Wrapping the factory keeps this adapter independent of the generated
 * serializer body and preserves the returned function's own properties.
 */
export function inject(
  content: string,
  options: { wrapperSpecifier?: string } = {},
) {
  const wrapperSpecifier = options.wrapperSpecifier ?? defaultWrapperSpecifier
  const root = parse(content, {
    sourceType: 'unambiguous',
  })

  const program = root.program
  const factoryName = hasFactory(program, 'createSerializeCss')
    ? 'createSerializeCss'
    : hasFactory(program, 'createCss')
      ? 'createCss'
      : undefined

  if (!factoryName) {
    throw new Error(
      'Cannot find Panda CSS createSerializeCss/createCss in the generated helpers file.',
    )
  }

  const wrapper = createFactoryWrapper(factoryName)
  const alreadyPatched = hasMarker(program, wrapper.markerName)
  if (!alreadyPatched) {
    addEscapeImport(program, wrapperSpecifier)
    program.body.push(wrapper.markerDeclaration, wrapper.assignment)
  }

  return {
    code: generate(root).code,
    alreadyPatched,
  }
}

export async function patch(
  src: string,
  dest?: string,
  options?: { wrapperSpecifier?: string },
) {
  const content = await fs.readFile(src, 'utf8')
  const { code } = inject(content, options)
  await fs.writeFile(dest ?? src, code, 'utf8')
}
