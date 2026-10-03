import type { TemplateParameterSchema } from '..'
import { expectAssignable, expectError, expectType } from 'tsd'
import { resolveTemplateParameters } from '..'

expectAssignable<TemplateParameterSchema>({ name: { type: 'string', required: true }, export: { type: 'boolean', default: true } })
expectType<Record<string, string | boolean>>(resolveTemplateParameters({ name: { type: 'string' } }, {}).values)
expectError(resolveTemplateParameters({ enabled: { type: 'boolean', default: 'true' } }))
expectError(resolveTemplateParameters({ style: { type: 'enum' } }))
expectError(resolveTemplateParameters({ token: { type: 'boolean', sensitive: true } }))
