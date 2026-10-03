import type { ResolvedTemplateSource, TemplateRemoteSource } from '@icebreakers/monorepo'
import { defineMonorepoConfig, resolveRemoteTemplateSource } from '@icebreakers/monorepo'
import { expectError, expectType } from 'tsd'

const source: TemplateRemoteSource = { kind: 'npm', packageName: '@org/templates', version: '1.2.3' }
expectType<Promise<ResolvedTemplateSource>>(resolveRemoteTemplateSource(source, 'templates/library', { offline: true }))
expectType<Promise<ResolvedTemplateSource>>(resolveRemoteTemplateSource({ kind: 'git', repository: 'https://example.test/templates.git', ref: 'main' }))
defineMonorepoConfig({ commands: { create: { templateMap: { team: { source: 'templates/library', target: 'packages/library', remote: source } } } } })
expectError(resolveRemoteTemplateSource({ kind: 'npm', packageName: '@org/templates' }))
expectError(resolveRemoteTemplateSource({ kind: 'git', repository: 'https://example.test/templates.git', version: '1.2.3' }))
