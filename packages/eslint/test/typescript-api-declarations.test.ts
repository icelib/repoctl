import { bindTypeScriptApi } from '../declarations/typescript-api'

it('binds imports, import types and augmentations without changing option values or comments', () => {
  const source = `import type ts from 'typescript';
import "typescript/lib/tsserverlibrary";
export type { Program } from "typescript";
type Program = import('typescript').Program;
declare module 'typescript' { interface Node { readonly custom?: true } }
declare module 'typescript/lib/tsserverlibrary' { enum JSDocParsingMode {} }
type DebugLevel = 'typescript' | 'eslint';
// Keep the 'typescript' option.
`
  expect(bindTypeScriptApi(source)).toBe(`import type ts from '@typescript/typescript6';
import "@typescript/typescript6/lib/tsserverlibrary.js";
export type { Program } from "@typescript/typescript6";
type Program = import('@typescript/typescript6').Program;
declare module '@typescript/typescript6' { interface Node { readonly custom?: true } }
declare module '@typescript/typescript6/lib/tsserverlibrary.js' { enum JSDocParsingMode {} }
type DebugLevel = 'typescript' | 'eslint';
// Keep the 'typescript' option.
`)
})
