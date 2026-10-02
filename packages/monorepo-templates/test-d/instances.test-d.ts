import type { PreparedTemplateSource, TemplateInstance, TemplateInstanceRegistry, TemplateSnapshot } from '..'
import { expectError, expectType } from 'tsd'
import { captureTemplateSnapshot, generationParameters, loadTemplateInstanceRegistry, prepareTemplateInstanceSource, recordGeneratedTemplateInstance, snapshotDigest } from '..'

expectType<Promise<TemplateSnapshot>>(captureTemplateSnapshot('/source'))
expectType<Promise<PreparedTemplateSource>>(prepareTemplateInstanceSource('/source'))
expectType<Promise<TemplateInstanceRegistry>>(loadTemplateInstanceRegistry('/workspace'))
expectType<string>(snapshotDigest({ schemaVersion: 1, files: [], directories: [] }))
declare const preparedSource: PreparedTemplateSource
expectType<Promise<TemplateInstance>>(recordGeneratedTemplateInstance({ workspaceDir: '/workspace', targetDir: '/workspace/packages/demo', template: 'tsdown', preparedSource, profile: 'repo-new-v1', parameters: { packageName: 'demo' } }))
expectError(generationParameters({ password: 'secret' }))
