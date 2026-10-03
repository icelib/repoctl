import type { TemplateValidationPlan, TemplateValidationReport } from '@icebreakers/monorepo'
import { planTemplateValidation, validateTemplate } from '@icebreakers/monorepo'
import { expectError, expectType } from 'tsd'

expectType<Promise<TemplateValidationPlan>>(planTemplateValidation({ template: 'internal', names: ['one', 'two'] }))
expectType<Promise<TemplateValidationReport>>(validateTemplate({ template: 'react-lib', keep: 'failure', signal: new AbortController().signal }))
expectError(validateTemplate({ template: 'custom', keep: true }))
expectError(validateTemplate({ template: 'custom', names: 'one' }))
