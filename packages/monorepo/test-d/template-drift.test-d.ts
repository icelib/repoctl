import type { TemplateDriftFile, TemplateDriftOwner, TemplateDriftReport } from '..'
import { expectError, expectType } from 'tsd'
import { checkTemplateDrift, formatTemplateDriftReport, hasTemplateDriftIssues } from '..'

expectType<Promise<TemplateDriftReport>>(checkTemplateDrift('/workspace', { remote: false }))
declare const report: TemplateDriftReport
declare const owner: TemplateDriftOwner
declare const file: TemplateDriftFile
expectType<'newer' | 'same' | 'ahead' | 'unknown'>(owner.version.status)
expectType<'unchanged' | 'modified' | 'deleted' | 'excluded' | 'unavailable'>(file.state)
expectType<string>(formatTemplateDriftReport(report))
expectType<boolean>(hasTemplateDriftIssues(report, true))
expectError(checkTemplateDrift('/workspace', { remote: 'yes' }))
expectError(checkTemplateDrift('/workspace', { suppressions: [{ id: 'template-instance-drift' }] }))
